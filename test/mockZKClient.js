/*!
 * solr client
 * Copyright(c) 2015 mcdan
 * Author mcdan http://github.com/mcdan
 * MIT Licensed
 */
'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var console = require('console');
var zookeeper = require('node-zookeeper-client');
var fs = require('fs');

var Builder = {};



var MockZKClient = function(path) {
	EventEmitter.call(this);
	this.fixturePath = path
	this.state = zookeeper.State.DISCONNECTED;
	this.watchers = {};
};
util.inherits(MockZKClient, EventEmitter);

MockZKClient.prototype.connect = function() {
	var self = this;
	setTimeout(function() {
		self.state = zookeeper.State.SYNC_CONNECTED;
		self.emit('connected');
	}, 500);
};

MockZKClient.prototype.getData = function(path, watcher, cb) {
	if (cb === undefined) {
		cb = watcher;
		watcher = undefined;
	}
	var collectionName = path.match(/\/collections\/([a-zA-Z0-9]*)\/state\.json/)[1];
	if (collectionName) {
		if (watcher !== undefined) {
			if (!this.watchers.hasOwnProperty(path)) {
				this.watchers[path] = [];
			}
			this.watchers[path].push(watcher);
		}

		fs.readFile(__dirname + '/' + this.fixturePath, {'encoding' : 'utf-8'}, function (err, data) {
			if (err) { 
				throw err;
	  		}
	  		data = data.replace(/\$\(collectionname\)/g, collectionName);
	  		data = data.replace(/\$\(hostname\)/g, 'host.domain.com');
	  		data = data.replace(/\$\(port\)/g, '8183');
	  		cb(null, data);
		});
	}
};

MockZKClient.prototype.updateCollectionState = function (collectionName, fixturePath) {
	this.fixturePath = fixturePath;
	var path = '/collections/' + collectionName + '/state.json';
	var self = this;
	fs.readFile(__dirname + '/' + this.fixturePath, {'encoding' : 'utf-8'}, function (err, data) {
		if (err) { 
			throw err;
  		}
  		data = data.replace(/\$\(collectionname\)/g, collectionName);
  		data = data.replace(/\$\(hostname\)/g, 'host.domain.com');
  		data = data.replace(/\$\(port\)/g, '8183');
  		if (self.watchers.hasOwnProperty(path)) {
  			var cbs  = self.watchers[path];
  			cbs.forEach(function (cb) {
  				cb(zookeeper.Event.NODE_DATA_CHANGED);
  			});
  			delete self.watchers[path];
  		}
	});
};

MockZKClient.prototype.getState = function() {
	return this.state;
};


module.exports = exports = MockZKClient;