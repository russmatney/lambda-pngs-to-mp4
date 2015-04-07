module.exports = {
  region: 'us-east-1',
  handler: 'index.handler',
  role: 'arn:aws:iam::106586740595:role/executionrole',
  functionName: 'pngs-to-mp4',
  timeout: 60
}
