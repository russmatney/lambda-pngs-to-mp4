var Q = require('q');
var path = require('path');

var execute = require('lambduh-execute');
var validate = require('lambduh-validate');
var download = require('lambduh-get-s3-object');
var upload = require('lambduh-put-s3-object');

process.env['PATH'] = process.env['PATH'] + ':/tmp/:' + process.env['LAMBDA_TASK_ROOT']

exports.handler = function(event, context) {
  var result = event;

  validate(result, {
    "srcKeys": true,
    "srcBucket": true,
    "dstKey": true,
    "dstBucket": true
  })

  //create /tmp/pngs/
  .then(function(result) {
    return execute(result, {
      shell: 'mkdir -p /tmp/pngs/; mkdir -p /tmp/renamed-pngs/;',
      logOutput: true
    })
  })

  //download pngs
  .then(function(result) {
    var def = Q.defer();

    var promises = [];
    result.srcKeys.forEach(function(key) {
      promises.push(download(result, {
        srcBucket: result.srcBucket,
        srcKey: key,
        downloadFilepath: '/tmp/pngs/' + path.basename(key)
      }))
    });

    Q.all(promises)
      .then(function(results) {
        def.resolve(results[0]);
      })
      .fail(function(err) {
        def.reject(err);
      });

    return def.promise;
  })

  //rename, mv pngs
  .then(function(result) {

    if (result.srcKey.indexOf('endcard') == -1) {
      return execute(result, {
        bashScript: '/var/task/rename-pngs',
        bashParams: [
          '/tmp/pngs/*.png',// input files
          '/tmp/renamed-pngs/'//output dir
        ],
        logOutput: true
      })
    } else {
      return execute(result, {
        bashScript: '/var/task/multiply-endcard',
        bashParams: [
          '/tmp/pngs/' + path.basename(result.srcKey), // input file (endcard)
          '/tmp/renamed-pngs/' //output dir
        ],
        logOutput: true
      })
    }
  })

  //convert pngs to mp4
  .then(function(result) {
    return execute(result, {
      bashScript: '/var/task/files-to-mp4',
      bashParams: [
        '/tmp/renamed-pngs/%04d.png',//input files
        '/tmp/video.mp4'//output filename
      ],
      logOutput: true
    })
  })

  //upload mp4
  .then(function(result) {
    return upload(result, {
      dstBucket: result.dstBucket,
      dstKey: result.dstKey,
      uploadFilepath: '/tmp/video.mp4'
    })
  })

  .then(function(result){
    console.log('finished');
    console.log(result);
    context.done()

  }).fail(function(err) {
    console.log(err);
    context.done(null, err);
  });

}
