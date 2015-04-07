var index = require('../');
var expect = require('chai').expect;

describe('timelapse handler', function() {
  it('should exist', function() {
    expect(index).to.exist;
  });

  it('should have a handler', function() {
    expect(index.handler).to.be.a('function');
  });

  it('should call .done(err) when things fail', function(done) {
    var event = {};//TODO: give bad data
    var context = {
      done: function(err, message) {
        if (err || message) {
          done();
        } else {
          done(new Error('expected error message'));
        }
      }
    }
    index.handler(event, context);
  });

  it.only('should call .done() when things go well', function(done) {
    this.timeout(30000);
    var event = {};
    var context = {
      done: function(err, message) {
        if (err || message) {
          done(err || message);
        } else {
          done();
        }
      }
    }
    index.handler(event, context);
  });

});
