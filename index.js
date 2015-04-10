var Q = require('q');
var path = require('path');
var fs = require('fs');
var req = require('request');

var execute = require('lambduh-execute');
var validate = require('lambduh-validate');
var download = require('lambduh-get-s3-object');
var upload = require('lambduh-put-s3-object');

process.env['PATH'] = process.env['PATH'] + ':/tmp/:' + process.env['LAMBDA_TASK_ROOT']

var downloadExternalFile = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  file.on('finish', function() {
    file.close(cb);  // close() is async, call cb after close completes.
  });
  file.on('error', function(err) { // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    if (cb) cb(err.message);
  });
  req(url).pipe(file);
};

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
    var def = Q.defer();

    if (event.srcUrl) {
      downloadExternalFile(event.srcUrl, '/tmp/pngs/' + path.basename(event.srcUrl),
        function(err) {
          if (err) {
            def.reject(err);
          } else {
            def.resolve(event)
          }
        })

    } else {

      var promises = [];
      event.srcKeys.forEach(function(key) {
        promises.push(download(event, {
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

    }
    return def.promise;
  })

  //rename, mv pngs
  .then(function(event) {

    if (event.srcKey.indexOf('endcard') == -1) {
      return execute(event, {
        bashScript: '/var/task/rename-pngs',
        bashParams: [
          '/tmp/pngs/*.png',// input files
          '/tmp/renamed-pngs/'//output dir
        ],
        logOutput: true
      })
    } else {
      return execute(event, {
        bashScript: '/var/task/multiply-endcard',
        bashParams: [
          '/tmp/pngs/' + path.basename(event.srcKey), // input file (endcard)
          '/tmp/renamed-pngs/' //output dir
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
