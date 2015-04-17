/**
 * Modules dependencies
 */

var mocha = require('mocha'),
	figc = require('figc'),
	assert = require('chai').assert,
	libPath = process.env['SOLR_CLIENT_COV'] ? '../lib-cov' : '../lib';
var zookeeper = require('node-zookeeper-client');
var zkMockClient = require('./mockZKClient');
var console = require('console');
var rewire = require('rewire');
var SolrCloudConfiguration = rewire(libPath + '/solrcloudconfig');

var config = figc(__dirname + '/' + 'cloud-config.json');

// These don't use the mock and verify the simplest connection to ZK for a specific colleciton.
// describe('CloudConfig Intergration Tests', function() {
// 	describe('#createConfig', function() {
// 		it('should should have options set', function(done) {
// 			var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
// 			assert.equal(solrConfig.options.zkHost, config.client.zkHostString);
// 			assert.equal(solrConfig.options.collection, config.client.core);
// 			done();
// 		});
// 	});
// 	describe('#loadingConfig', function() {
// 		it('should become ready at some point', function(done) {
// 			var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
// 			solrConfig.once('ready', function() {
// 				done();
// 			});
// 		});
// 	});
// });

describe('Solr Cloud Config Tests', function() {
	'use strict';
	describe('One Shard Test one Replica:', function () {
		var revert;
		before(function() {
			revert = SolrCloudConfiguration.__set__({
				'zookeeper': {
					'createClient': function() {
						return new zkMockClient('fixtures/zookeeper/OneShardOneReplica.json');
					},
					'State' : zookeeper.State
				}
			});
		});
		after(function() {
			revert();
		});
		describe('#createConfig', function() {
			it('should should have options set', function() {
				var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
				assert.equal(solrConfig.options.zkHost, config.client.zkHostString);
				assert.equal(solrConfig.options.collection, config.client.core);
			});
		});
		describe('#checkingReady', function() {
			it('should become ready at some point', function(done) {
				var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
				solrConfig.once('ready', function() {
					done();
				});
			});
		});
		describe('#getServerInfo', function() {
			var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
			solrConfig.once('ready', function() {
				it('shouldHaveAServer', function(done) {
					var s = solrConfig.getServer();
					assert.isNotNull(s);
					assert.property(s, 'hostname', 'Servers must have hostnames');
					assert.property(s, 'port', 'Servers must have ports');
					assert.property(s, 'path', 'Servers must have paths to solr');
					done();
				});
			});
		});
	});

	describe('One Shard Three Replicas:', function() {
		'use strict';
		var revert;
		before(function() {
			revert = SolrCloudConfiguration.__set__('zookeeper', {
				'createClient': function() {
					return new zkMockClient('fixtures/zookeeper/OneShardThreeReplicas.json');
				},
				'State': zookeeper.State
			});
		});
		after(function(){
			revert();
		});
		describe("#Server rotation:", function() {
			it('server one is different from server two', function(done) {
				var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
				solrConfig.once('ready', function() {
					var one = solrConfig.getServer();
					var two = solrConfig.getServer();
					assert.isNotNull(one);
					assert.isNotNull(two);
					assert.notEqual(one.toString(), two.toString(),
						'Servers should rotate when there is more than one replica.');
					done();
				});
			});
			it('fourth server should be the same as the first', function(done) {
				var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
				solrConfig.once('ready', function() {
					var one = solrConfig.getServer();
					var two = solrConfig.getServer();
					var three = solrConfig.getServer();
					var four = solrConfig.getServer();
					assert.isNotNull(one);
					assert.isNotNull(two);
					assert.isNotNull(three);
					assert.isNotNull(four);
					assert.notEqual(one.toString(), two.toString(),
						'Servers should rotate when there is more than one replica.');
					assert.notEqual(one.toString(), two.toString(),
						'Servers should rotate when there is more than one replica.');
					assert.notEqual(two.toString(), three.toString(),
						'Servers should rotate when there is more than one replica.');
					assert.notEqual(three.toString(), four.toString(),
						'Servers should rotate when there is more than one replica.');
					assert.equal(one.toString(), four.toString(),
						'Servers should loop back around and the first and forth should be the same');
					done();
				});
			});	
		});
	});

	describe('Zookeeper Status Changes:', function() {
		'use strict';
		var revert;
		var mockClient = new zkMockClient('fixtures/zookeeper/OneShardThreeReplicasOneDead.json');
		before(function() {
			revert = SolrCloudConfiguration.__set__('zookeeper', {
				'createClient': function() {
					return mockClient;
				},
				'State': zookeeper.State,
				'Event': zookeeper.Event
			});
		});
		after(function() {
			revert();
		});
		describe("#Replica Down:", function() {
			it('Don\'t return dead replica', function(done) {
					var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
					solrConfig.once('ready', function() {
						var one = solrConfig.getServer();
						var two = solrConfig.getServer();
						var oneAgain = solrConfig.getServer();
						assert.ok(one);
						assert.ok(two);
						assert.equal(one.toString(), oneAgain.toString());
						done();
					});
				});
			});
		describe('#Replica down after load', function() {
			it('Don\'t return killed replica', function(done) {
				var solrConfig = new SolrCloudConfiguration(config.client.zkHostString, config.client.core);
				solrConfig.once('ready', function() {
					var one = solrConfig.getServer();
					assert.ok(one);
					solrConfig.once('updated',function() {
							var onlyOne = solrConfig.getServer();
							var sameOne = solrConfig.getServer();
							assert.ok(onlyOne);
							assert.ok(sameOne);
							assert.equal(onlyOne.toString(), sameOne.toString());
							done();
					});
					mockClient.updateCollectionState(config.client.core,
						'fixtures/zookeeper/OneShardThreeReplicasTwoDead.json');
				});
			});
		});
	});
});