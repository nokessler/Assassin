module.exports.loaddata = reinitdata
module.exports.computeteams = computeteams
module.exports.computeplayers = computeplayers
module.exports.computemytarget = computemytarget
module.exports.unassignedplayers = unassignedplayers

var csv = require('csv-array');
var HashMap = require('hashmap');
var app = require('express');

var local;
var assassin;

function computemytarget(cloudant, user, response) {
    local = cloudant;
    computeplayersJSON(function (players) {
	console.log(players);
	var player = players[0];
	var i = 0;

	while (player.id != user && i < players.length-1) { i = i+1; player = players[i] };
	if (i == players.length-1) {console.log("player " + user + "not found");  response.send("");}

	// player is the one you want!
	computeteamsJSON( function(teams) {
	    console.log(teams);
	    var team = teams[0];
	    console.log("Team =", team);
	    var j=0;

	    // find the player's team
	    while (team.name != player.team && j < teams.length-1) { j = j+1; team = teams[j]; console.log(team);};
	    if (j == teams.length-1) {console.log("no team found for player" + JSON.stringify(player));
				     response.send("");}
	    // find the team's target information
	    j=0;
	    target = teams[0];
	    while (target.name != team.target.current && j < teams.length-1) { j = j+1; target = teams[j]};
	    if (j == teams.length-1) response.send("");
//	    target = {"name":"pineapple","player1":{"name":"Jaret Stillman","status":"alive"},"player2":{"name":"Jeff Liu","status":"alive"}};
	    console.log(JSON.stringify(target));
	    response.send(JSON.stringify(target));
	}); // get targetlist
    }); // get playerlist
};

function unassignedplayers(cloudant, response) {
    local = cloudant;
    computeplayersJSON( function(players) {
	var unassigned = [];
	players.forEach(function(player) {
	    if(player.team == "" && player.role != "god") unassigned.push(player);
	});
	response.send(JSON.stringify(unassigned));
    });
}


function computeplayers(cloudant, response) {
    local = cloudant;
    computeplayersJSON( function (players) {
	response.send(JSON.stringify(players));
    });
}

function computeplayersJSON(callback) {
    assassin = local.db.use('assassin');
    assassin.view('team', 'players-on-teams', {include_docs: false}, function (err, playersonteams) {
  	if(err) return err;
	assassin.view('players', 'players-index', {include_docs: true}, function(err, allplayers) {
            if(err) return err;
	    var players = addteamstoplayers(playersonteams, allplayers);
	    callback(players);
	});
    });
}

function addteamstoplayers(playersonteams, allplayers){
    var allplayerlist = [];
    var playersonteamshash = new HashMap();
    var playerteam;

    playersonteams.rows.forEach(function(row) {
	playersonteamshash.set(row.key.player, {"player": row.key.player, "team": row.id});
    });
    allplayers.rows.forEach(function(doc) {
	playerteam = playersonteamshash.get(doc.id);
	if (playerteam) {    // rjc: new line
	    // allplayerslist.push({"id": doc.id, "name": doc.value.name, "role": doc.value.role, "team": doc.value.team, "status": doc.value.status});
	    allplayerlist.push({"id": doc.id, "name": doc.value.name, "role": doc.value.role, "team": playerteam.team, "status": doc.value.status});
	}
	else {  // rjc: new line
	    allplayerlist.push({"id": doc.id, "name": doc.value.name, "role": doc.value.role, "team": "", "status": doc.value.status});
	}
    });
    return allplayerlist;
}

function computeteams(cloudant, response) {
    local = cloudant;
    computeteamsJSON( function (teams) {
	response.send(JSON.stringify(teams));
    });
}

function computeteamsJSON(callback) {
    assassin = local.db.use('assassin');
    assassin.view('team', 'team-index', {include_docs: true}, function returnfromcloudant(err, body) {
	if(err) return err;
	teams = afterteam(err, body);
	callback(teams);
    });
}

function afterteam(err, body) {
    if (err) return err;
    var teams = new HashMap();
    var curtarget;
    var curteam = body.rows[0].key.team;
    var teamrow = initteamrow(curteam);
    body.rows.forEach(function(row) {
	if (curteam != row.key.team) {
	    computeteamstatus(teamrow);
	    teams.set(teamrow.name, teamrow);
	    curteam = row.key.team;
	    teamrow = initteamrow(curteam);
	};
	if (row.key.field == 'player1') {
	    teamrow.player1.name = row.doc.first.concat(' ').concat(row.doc.last);
	    teamrow.player1.status = row.doc.status;
	};

	if (row.key.field == 'player2') {
	    teamrow.player2.name = row.doc.first.concat(' ').concat(row.doc.last);
	    teamrow.player2.status = row.doc.status;
	};

	if (row.key.field == 'target') {
	    teamrow.target.original = row.doc.name;
	    teamrow.target.current =  row.doc.name;
	};
    });
    computeteamstatus(teamrow);
    teams.set(teamrow.name, teamrow);
    teams.forEach(function(team) {
	curtarget = teams.get(team.target.current);
	while (curtarget.status == 'dead' && curtarget != team) {
	    team.target.current = curtarget.target.current
	    curtarget = teams.get(team.target.current);
	}
    });
    return organizeTeams(teams);
//    return teams.values();  // rjc:  added .values()
}

function organizeTeams(teams){
    var ret = teams.values();
    ret.sort();
    var cur = 0;
    var nxt = 1;
    var numberOfTeams = ret.length;
    while(cur < ret.length-1){
	if(ret[cur].target.original != ret[nxt].name){
	    ret[nxt] = teams.get(ret[cur].target.original);
	}
	cur++; nxt++;
    }
    ret.forEach(function(value){
	console.log(value);
    });
    return ret;
}

function initteamrow(curteam) {
		var teamrow = {};
		teamrow.name = curteam;
		teamrow.player1 = {};
		teamrow.player2 = {}
		teamrow.target = {};
		return teamrow;
}

function computeteamstatus(team) {
		if (team.player1.status != 'alive' && team.player2.status != 'alive')
	team.status = 'dead';
		else team.status = 'alive';
		//if (team.name == "grape" || team.name == "cantalope") team.status = 'dead';
}


// Functions for initializing the database

function reinitdata(cloudant) {
		local = cloudant;
		local.db.destroy('assassin', afterdestroy);
}

function afterdestroy(err) {
		if(err) return err;
		console.log('You have destroyed the assassin database.');
		local.db.create('assassin', afterdbcreate);
		assassin  = local.db.use('assassin');
}

function afterdbcreate(err) {
		if(err) return err;
		console.log('You have created the assassin database');
		var indices = [
	{
			"_id": "_design/players",
			"views": {
		"players-index": {
				"map": "function (player) {\n  if (player.type == 'player')\n  {\n    emit({role:player.role, last:player.last}, {name: player.first.concat(' ').concat(player.last), role: player.role, status: player.status });\n  }\n}"
		}
			},
			"language": "javascript"
	},
	{
			"_id": "_design/team",
			"views": {
		"team-index": {
				"map": "function (team) {\n  if(team.type == 'team') {\n    emit({team:team.name, field:\"player1\"}, {_id:team.player1});\n    emit({team:team.name, field:\"player2\"}, {_id:team.player2});\n    emit({team:team.name, field:\"target\"}, {_id:team.target});\n  } \n} "
		}
			},
			"language": "javascript"
	}
	];
		assassin.bulk( {'docs': indices}, afterindexcreate);
}

function afterindexcreate(err, body, header) {
		if(!err) {
				console.log('You have created the indicies.');
				console.log(body);
	err = csv.parseCSV("public/data/players.csv", insertplayers, true);
		}
		if(!err)
	err = csv.parseCSV("public/data/teams.csv", insertteams, true);
		return err;
}

function insertplayers(data) {
		data.forEach(function(player) {
			var id = player.first.substr(0,2).concat(player.last).toLowerCase();
			assassin.insert(player, id, function afterplayerinsert(err, body, header) {
				if (err)
			{ return console.log('[assassin.insert] ', err.message) };
				console.log('You have inserted the player.');
				console.log(body);
		});
	})}


function insertteams(data) {
		data.forEach(function(team) {
			assassin.insert(team, team.name, function afterteaminsert(err, body, header) {
				if (err)
			{ return console.log('[assassin.insert] ', err.message) };
				console.log('You have inserted the team.');
				console.log(body);
		});
	})}
