var Q = require('q');
var path = require('path');

var execute = require('lambduh-execute');
var validate = require('lambduh-validate');
var s3Download = require('lambduh-get-s3-object');
var upload = require('lambduh-put-s3-object');
var downloadFile = require('lambduh-download-file');

process.env['PATH'] = process.env['PATH'] + ':/tmp/:' + process.env['LAMBDA_TASK_ROOT']

exports.handler = function(event, context) {
  validate(event, {
    "srcKeys": true,
    "srcBucket": true,
    "dstKey": true,
    "dstBucket": true
  })

  //create /tmp/pngs/
  .then(function(event) {
    return execute(event, {
      shell: 'mkdir -p /tmp/pngs/; mkdir -p /tmp/renamed-pngs/;',
      logOutput: true
    })
  })

  //download pngs
  .then(function(event) {
    if (event.srcUrl) {
      return downloadFile({
        filepath: '/tmp/pngs/' + path.basename(event.srcUrl),
        url: event.srcUrl
      })
    } else {
      var def = Q.defer();

      var promises = [];
      event.srcKeys.forEach(function(key) {
        promises.push(s3Download(event, {
          srcBucket: event.srcBucket,
          srcKey: key,
          downloadFilepath: '/tmp/pngs/' + path.basename(key)
        }))
      });

      Q.all(promises)
        .then(function(event) {
          def.resolve(event[0]);
        })
        .fail(function(err) {
          def.reject(err);
        });
      return def.promise;
    }
  })

  //rename, mv pngs
  .then(function(event) {

    if (event.srcUrl) {
      return execute(event, {
        bashScript: '/var/task/multiply-endcard',
        bashParams: [
          '/tmp/pngs/' + path.basename(event.srcUrl), // input file (endcard)
          '/tmp/renamed-pngs/' //output dir
        ],
        logOutput: true
      })
    } else {
      return execute(event, {
        bashScript: '/var/task/rename-pngs',
        bashParams: [
          '/tmp/pngs/*.png',// input files
          '/tmp/renamed-pngs/'//output dir
        ],
        logOutput: true
      })
    }
  })

  //convert pngs to mp4
  .then(function(event) {
    return execute(event, {
      bashScript: '/var/task/files-to-mp4',
      bashParams: [
        '/tmp/renamed-pngs/%04d.png',//input files
        '/tmp/video.mp4'//output filename
      ],
      logOutput: true
    })
  })

  //upload mp4
  .then(function(event) {
    return upload(event, {
      dstBucket: event.dstBucket,
      dstKey: event.dstKey,
      uploadFilepath: '/tmp/video.mp4'
    })
  })

  //clean up
  .then(function(event) {
    return execute(event, {
      shell: "rm -f /tmp/pngs/*; rm -f /tmp/renamed-pngs/*;"
    })
  })

  .then(function(event){
    console.log('finished');
    console.log(event);
    context.done()

  }).fail(function(err) {
    console.log(err);
    context.done(null, err);
  });

}
