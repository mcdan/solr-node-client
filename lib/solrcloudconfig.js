/*!
 * solr client
 * Copyright(c) 2015 mcdan
 * Author mcdan http://github.com/mcdan
 * MIT Licensed
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var zookeeper = require('node-zookeeper-client');
var url = require('url');
var console = require('console');

var SolrServer = function(baseUrl) {
    'use strict';
    console.trace('Creating server object for string: %s', baseUrl);
    var parsed = url.parse(baseUrl);
    this.hostname = parsed.hostname;
    this.port = parsed.port;
    this.path = parsed.path;
};

var SolrShard = function(name, zkDetails) {
    'use strict';
    this.lastReplicaId = 0;
    this.details = zkDetails;
    this.replicaIds = Object.keys(zkDetails.replicas);
    this.name = name;
};

SolrShard.prototype.getNextReplicaServer = function() {
    'use strict';
    if (this.lastReplicaId > this.replicaIds.length) {
        this.lastReplicaId = 0;
    }
    var replicaIdToUse = this.replicaIds[this.lastReplicaId];
    console.trace('Using replica id %s from shard: %s', replicaIdToUse, this.name);
    var selectedReplica = this.details.replicas[replicaIdToUse];
    console.trace('Replica Details: %j', selectedReplica);
    var server = new SolrServer(selectedReplica.base_url);
    this.lastReplicaId += 1;
    return server;
};

SolrShard.prototype.matches = function(docId) {
    'use strict';
    // Possibly used for limiting queries to a certain shard?
    if (!docId) {
        return true;
    }

    return false;
};

var SolrCloudConfiguration = function(zkHostPath, collection) {
    'use strict';
    this.options = {
        zkHost: zkHostPath || null,
        collection: collection || null
    };
    // Initialize Event Emitter
    EventEmitter.call(this);
    console.trace('Connecting to  ZK: %s', this.options.zkHost);
    this.zkClient = zookeeper.createClient(this.options.zkHost);
    this.ready = false;
    this.zkClient.connect();
    var self = this;
    this.zkClient.on('connected', function() {
        self.gotConnection();
    });
    this.shards = [];
};

util.inherits(SolrCloudConfiguration, EventEmitter);

SolrCloudConfiguration.prototype.gotConnection = function() {
    'use strict';
    if (this.zkClient && (this.zkClient.getState() === zookeeper.State.SYNC_CONNECTED)) {
        var collectionStatePath = '/collections/' + this.options.collection + '/state.json';
        console.trace('Getting collection\'s state: %s', collectionStatePath);
        var self = this;
        this.zkClient.getData(collectionStatePath, function(error, data) {
            if (error) {
                console.log(error.stack);
                return;
            }
            console.trace('State information from zk: %s', data);
            var details = {};
            try {
                details = JSON.parse(data);
                if (details.hasOwnProperty(self.options.collection)) {
                    details = details[self.options.collection];
                } else {
                    details = {};
                    console.warn('ZK does not seem to have the request collection (%s), waiting',
                        self.options.collection);
                }
            } catch (e) {
                console.log('Could not parse data into JSON from zk:: %s', data);
            }
            // Walk all the shards, add the range and shard name, not used yet.
            Object.keys(details.shards).forEach(function(o) {
                console.trace('Adding shard to config: %s', o);
                self.shards.push(new SolrShard(o, details.shards[o]));
            });
            self.ready = true;
            self.emit('ready');
        });
    }
};

SolrCloudConfiguration.prototype.getServer = function(docid) {
    'use strict';
    console.trace('Looking for a matching shard.');
    var server = null;
    this.shards.forEach(function(s) {
        if (s.matches(docid)) {
            console.trace('Matching shard: %s', s.name);
            server = s.getNextReplicaServer();
            console.trace('Returning server %j', server);
            return false;
        }
    });
    return server;
};

SolrCloudConfiguration.prototype.isReady = function() {
    'use strict';
    return this.ready;
};

SolrCloudConfiguration.prototype.makeReady = function() {
    'use strict';
    this.emit('ready');
};

module.exports = exports = SolrCloudConfiguration;