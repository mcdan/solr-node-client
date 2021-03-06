/**
 * Modules dependencies
 */

var mocha = require('mocha'),
	figc = require('figc'),
	assert = require('chai').assert,
	libPath = process.env['SOLR_CLIENT_COV'] ? '../lib-cov' : '../lib',
	solr = require( libPath + '/solr'),
	SolrError = require(libPath + '/error/solr-error'),
	sassert = require('./sassert');

var argv = require('minimist')(process.argv.slice(2));
// Test suite
var configPath = argv.configPath || 'config.json';
var config = figc(__dirname + '/' + configPath);
var client = solr.createClient(config.client);
var basePath = [config.client.path, config.client.core].join('/').replace(/\/$/,"");

describe('Client',function(){
	describe('#deleteAll(callback)',function(){
		it('should delete all documents',function(done){
			client.deleteAll(function(err,data){
				sassert.ok(err,data);
				done();
			});
		});
	});
});
