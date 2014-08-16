var express = require('express');
var ws = require('ws');
var http = require('http');
var https = require('https');
var MongoWatch = require('mongo-watch');
var urlParser = require('url');
var cookieParser = require('cookie-parser');
var mongoose = require('mongoose'), Schema = mongoose.Schema;

var HashMap = require('hashmap').HashMap;
var ObjectID = require('mongodb').ObjectID;

var app = express();

// Initialize cookie parser for getting user's session ID
var parseCookie = new cookieParser();
app.use(parseCookie);

// Initialize database connection and create URL model
var dbHost = '127.0.0.1';
var dbName = 'httpchecker';
var urlCollection = 'Url';

mongoose.connect('mongodb://' + dbHost + '/' + dbName);

var urlSchema = mongoose.Schema({
    address: String,
    sessionId: String,
    batchId: Number,
    isRedirect: Boolean,
    responseCode: Number,
    contentLength: Number,
    redirLocation: String
});

var Url = mongoose.model('Url', urlSchema, urlCollection);

// Initialzie other variables and structures
var maxConnectionsPerIP = 3;
var clientMap = new HashMap();
var originConnections = new HashMap();

// Initialize HTTP server and start listening for incoming connections
var server = http.createServer(app);
server.maxConnections = 20;
server.listen(8081);

// Initialize WebSocket server
var wss = new ws.Server({server: server});

// Start watching for the database changes
watcher = new MongoWatch({useMasterOplog:true});

watcher.watch(dbName + '.' + urlCollection, function(event) {
    // We are only interested in events triggered by insertation of new URLs and resubmissions
    if((event.op == 'i' && !event.o.responseCode) || event.o.$unset) {
        var id = event.op == 'i' ? event.o._id : event.o2._id;

        // Fetch URL based on the ID from the triggered event
        Url.findOne({ '_id': ObjectID(id) }, function (err, url) {
            // Send initialization for this URL via all connections on this session. This is needed in case 
            // that user has index page opened more than once (i.e. one session with multiple connections)
            sendClientResponse(url);
            // Issue an HTTP request for this URL 
            makeHttpRequest(url);
        });
    }
});

// When client establishes a new socket connection
wss.on('connection', function(client) {
    var origin = client.upgradeReq.headers['origin'];
    var sessionId;

    // Get session ID
    parseCookie(client.upgradeReq, null, function(err) {
        sessionId = client.upgradeReq.cookies['PHPSESSID'];
    });

    // Store this connection
    addConnection(client, sessionId);

    // Remove connection when client disconnects
    client.on('close', function() {
        removeConnection(client, sessionId);
    });

    // Check if client is allowed to connect (i.e. he hasn't reached the connection limit and comes from a local IP)
    if(originConnections.get(origin) > maxConnectionsPerIP || !isLocalOrigin(origin))    {
        client.close();
        return;
    }

    // Get URLs that have been previously requested on this session and return them to the client
    Url.find({sessionId: sessionId }, null, {sort: {isRedirect: 1, _id: 1}}, function (err, urls) {
                urls.forEach(function(url) {
                    sendClientResponse(url, client);            
                });
    });
});

// Store WebSocket connection
function addConnection(client, sessionId) {
    // Add client to the [session -> clients] map
    var clients = clientMap.get(sessionId) ? clientMap.get(sessionId) : [];
    clients.push(client);
    clientMap.set(sessionId, clients);

    // Update number of current connections for this client's origin
    updateOriginConnections(client, 1);
}

// Remove WebSocket connection
function removeConnection(client, sessionId) {
    // Remove client from the [session -> clients] map
    var clients = clientMap.get(sessionId).filter(function(cur) {
             return cur !== client;
    });
    clientMap.set(sessionId, clients);

    // Update number of current connections for this client's origin
    updateOriginConnections(client, -1);    
}

// Update connection count for the given origin IP
function updateOriginConnections(client, change) {
    var origin = client.upgradeReq.headers['origin'];
    var connectionCount = originConnections.get(origin) || 0;
    originConnections.set(origin, parseInt(connectionCount) + change);
}

// Issue a HTTP request for the given URL
function makeHttpRequest(url, requestMethod) { 
    requestMethod |= 'HEAD';

    // Format and parse URL's address
    var address = formatAddress(url.address);
    var urlObj = urlParser.parse(address);

    var requestOptions = {
        host: urlObj.host,
        path: urlObj.path,
        method: requestMethod
    };

    var requester = urlObj.protocol == 'https:' ? https : http;
    var bodyLength = 0;

    var request = requester.request(requestOptions, function(response) {
        if(requestMethod == 'HEAD') {
            // Resubmit GET request in case HEAD request is not allowed 
            // or response header doesn't contain content-length field
            if((!response.headers['content-length'] && !isRedirect(response.statusCode)) 
                || notAllowed(response.statusCode)) {
                makeHttpRequest(url, 'GET');
            }
            else {
                handleHttpResponse(response, url);
            }
        }
        else {
            // Keep track of the response body length for GET requests
            response.on('data', function (chunk) {
                bodyLength += chunk.length;
            });

            // When GET request has finished, handle the response
            response.on('end', function () {
                url.contentLength = bodyLength;
                handleHttpResponse(response, url);
            });
        }
    });
            
    request.on('error', function(err) {
        handleErrorResponse(url);
    });    
    
    request.end();
}

// Forward response data to clients while dealing with HTTP redirects
function handleHttpResponse(response, url) {
    url.responseCode = response.statusCode;

    if(response.headers['content-length']) {
        url.contentLength = response.headers['content-length'];
    }

    // If this URL has HTTP redirect, issue another request
    if(isRedirect(url.responseCode)) {
        var redir = new Url({ address: response.headers['location'],
                              batchId: url.batchId,
                              sessionId: url.sessionId,
                              isRedirect: true
                            });
        url.redirLocation = redir.address;
        makeHttpRequest(redir);
    }
   
    // Send response to the client and store URL changes to the database 
    sendClientResponse(url);
    url.save(function(err, url) {}); 
}

// Handle URLs which have encountered errors during HTTP request
function handleErrorResponse(url) {
    url.responseCode = 0;
    url.contentLength = 0;

    sendClientResponse(url);
    url.save(function(err, url) {});
}

// Forward response either to all connections on the session for this URL 
// or just one specific connection
function sendClientResponse(url, client) {
    var connections = [];

    if(client != null) {  
        connections.push(client);
    }
    else {
        connections = clientMap.get(url.sessionId);
    }

    for(var i = 0; i < connections.length; i++) {
        connections[i].send(url.address + "##" + url.id + "##" + url.batchId + "##" + url.responseCode + "##" + url.contentLength + "##" + url.redirLocation);
    }
}

// Returns true if given response code indicates HTTP redirect
function isRedirect(responseCode) {
    return responseCode == '301' || responseCode == '302';
}

// Returns true if given response code indicates that request method isn't allowed
function notAllowed(responseCode) {
    return responseCode == '405';
}

// Define 'startsWith' function for strings
String.prototype.startsWith = function (str){
    return this.indexOf(str) == 0;
};

// Add protocol to the given URL (defaults to 'http')
function formatAddress(address) {
    if(address.startsWith('http://', true) || address.startsWith('https://', true)) {
        return address;
    }

    return 'http://' + address;
}

// Check whether given IP is local
function isLocalOrigin(origin) {
    origin = formatAddress(origin);

    return origin.startsWith('http://127.0.') || origin.startsWith('http://10.0.') 
           || origin.startsWith('http://192.168.');
}

module.exports = app;
