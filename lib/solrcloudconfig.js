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
var traceLogging = false;

var SERVER_STATE = {
    'ACTIVE' : 'active',
    'DOWN' : 'down'
};


function loadCollectionStatus(client, emitThisEvent) {
    'use strict';
    var collectionStatePath = '/collections/' + client.options.collection + '/state.json';
    if (traceLogging) {
        console.trace('Getting collection\'s state: %s', collectionStatePath);
    }

    var self = client;
    client.zkClient.getData(collectionStatePath, 
        function(e) {
            // Watcher for changes in data
            if (traceLogging) {
                console.trace('Watcher called!');
            }
            if (e === zookeeper.Event.NODE_DATA_CHANGED) {
                if (traceLogging) {
                    console.trace('Calling loadCollection again.');
                }
                loadCollectionStatus(self, 'updated');
            }
        },
        function(error, data) {
            // Call back for data GET
            if (error) {
                console.error(error.stack);
                return;
            }
            if (traceLogging) {
                console.trace('State information from zk: %s', data);
            }
            var details = {};
            try {
                client.shards = [];
                details = JSON.parse(data);
            } catch (e) {
                console.error('Could not parse data into JSON from zk:: %s', data);
            }
            if (details.hasOwnProperty(client.options.collection)) {
                details = details[client.options.collection];
                client.shards = [];
                // Walk all the shards, add the range and shard name, not used yet.
                Object.keys(details.shards).forEach(function(o) {
                    if (traceLogging) {
                        console.trace('Adding shard to config: %s', o);
                    }
                    client.shards.push(new SolrShard(o, details.shards[o]));
                });

                if (!emitThisEvent) {
                    if (traceLogging) {
                        console.trace('Firing event: %s: ', 'ready');
                    }
                    self.ready = true;
                    self.emit('ready');

                } else {
                    if (traceLogging) {
                        console.trace('Firing event: %s: ', emitThisEvent);
                    }
                    self.emit(emitThisEvent);
                }
            } else {
                console.error('ZK does not seem to have the requested collection (%s), waiting',
                    client.options.collection);
            }
        }
    );
}


var SolrServer = function(baseUrl) {
    'use strict';
    if (traceLogging) {
        console.trace('Creating server object for string: %s', baseUrl);
    }
    var parsed = url.parse(baseUrl);
    this.hostname = parsed.hostname;
    this.port = parsed.port;
    this.path = parsed.path;
    this.baseUrl = baseUrl;
};

SolrServer.prototype.toString = function() {
    'use strict';
    return this.baseUrl;
};

var SolrShard = function(name, zkDetails) {
    'use strict';
    this.lastReplicaIndex = 0;
    this.details = zkDetails;
    this.replicaIds = Object.keys(zkDetails.replicas);
    this.name = name;
};

SolrShard.prototype.getNextReplicaServer = function() {
    'use strict';
    if (traceLogging) {
        console.trace('Selecting Id using index: %s from %j',  this.lastReplicaIndex, this.replicaIds);
    }
    if (this.lastReplicaIndex >= this.replicaIds.length) {
        this.lastReplicaIndex = 0;
    }    
    var server = null;
    var startIndex = this.lastReplicaIndex;
    while (server === null) {
        var replicaIdToUse = this.replicaIds[this.lastReplicaIndex];

        if (traceLogging) {
            console.trace('Using replica id %s from shard: %s', replicaIdToUse, this.name);
        }
        var selectedReplica = this.details.replicas[replicaIdToUse];
        if (traceLogging) {
            console.trace('Replica Details: %j', selectedReplica);
        }
        if (selectedReplica.state === SERVER_STATE.ACTIVE) {
            server = new SolrServer(selectedReplica.base_url);
        } else {
            if(traceLogging) {
                console.trace('Skipping replica: %s due to state:\n %j',
                    replicaIdToUse, selectedReplica);
            }
        }
        this.lastReplicaIndex += 1;
        if (this.lastReplicaIndex >= this.replicaIds.length) {
            this.lastReplicaIndex = 0;
        }
        if (startIndex === this.lastReplicaIndex && (server === null)) {
            console.error('Could not find a replica that is alive in the shard: %s\n%j',
                this.name, this.details);
            break;
        }

    }
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
    if (traceLogging) {
        console.trace('Connecting to  ZK: %s', this.options.zkHost);
    }
    this.zkClient = zookeeper.createClient(this.options.zkHost);
    this.ready = false;
    this.zkClient.connect();
    this.shards = [];
    var self = this;
    this.zkClient.on('connected', function() {
        self.gotConnection();
    });
};

util.inherits(SolrCloudConfiguration, EventEmitter);

SolrCloudConfiguration.prototype.gotConnection = function() {
    'use strict';
    if (this.zkClient && (this.zkClient.getState() === zookeeper.State.SYNC_CONNECTED)) {
        loadCollectionStatus(this);
    }
};

SolrCloudConfiguration.prototype.getServer = function(docid) {
    'use strict';
    if (traceLogging) {
        console.trace('Looking for a matching shard.');
    }
    var server = null;
    this.shards.forEach(function(s) {
        if (s.matches(docid)) {
            if (traceLogging) {
                console.trace('Matching shard: %s', s.name);
            }
            server = s.getNextReplicaServer();
            if (traceLogging) {
                console.trace('Returning server %j', server);
            }
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