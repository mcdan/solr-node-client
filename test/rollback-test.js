/**
 * Modules dependencies
 */

var mocha = require('mocha'),
	figc = require('figc'),
	assert = require('chai').assert,
	libPath = process.env['SOLR_CLIENT_COV'] ? '../lib-cov' : '../lib',
	solr = require( libPath + '/solr'),
	sassert = require('./sassert');

var argv = require('minimist')(process.argv.slice(2));
// Test suite
var configPath = argv.configPath || 'config.json';
var config = figc(__dirname + '/' + configPath);
var client = solr.createClient(config.client);
var basePath = [config.client.path, config.client.core].join('/').replace(/\/$/,"");

describe('Client',function(){
	describe('#rollback(callback)',function(){
		it('should rollback all changes before the last hard commit',function(done){
			if (client.options.zkHost === null) {
				client.rollback(function(err,data){
					sassert.ok(err,data);
					done();
				});
			} else {
				// Fails due to roll back being unsupported in cloud mode.
				done();
			}
		});
	});
});
