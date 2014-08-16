// Initialize Angular module
var HRC = angular.module('HttpResponseChecker', []).config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('[[').endSymbol(']]');
});

// Define main controller for the application
HRC.controller('HRC2Controller', function($scope, $http) {
    $scope.MAX_URLS = 1000;
    $scope.totalUrls = 0;
    $scope.batches = [];
    $scope.addressToUrl = [];
    inputRows = '';
    serverHost = '127.0.0.1';
    socketPort = '8081';

    // Initialize new PHP user session
    $http.get('http://' + serverHost + '/hrc2/createSession').success(function(data, status, headers, config) {
        // Establish socket connection to the NodeJS server
        var mSocket = new WebSocket('ws://' + serverHost + ':' + socketPort);

        // Triggered when response from the server is received
        mSocket.onmessage = function (message) {
            // Analyse the message and get URL data
            var messageData = message.data.split("##");

            var address = messageData[0];
            var urlId = messageData[1];
            var batchId = parseInt(messageData[2], 10);
            var responseCode = messageData[3];
            var contentLength = messageData[4];
            var redirLocation = messageData[5];

            // Fetch existing URL object for this address or create a new one
            var url = getUrlByAddress(address);

            if(!url) {
                var batch = getOrCreateBatch(batchId);
                url = createNewUrl(address, urlId, batch);
            }

            url.updateState(responseCode, contentLength, redirLocation);

            $scope.$apply();
        };

        mSocket.onclose = function () {
            $scope.socketClosed = true;
            $scope.$apply();
        }
    });

    // Send URLs to the backend for processing
    $scope.submitData = function () { 
        var requestList = [];
        var newBatch = new Batch();        

        // If user entered more than 1000 URLs, we want to process only the first 1000
        var rowLimit = inputRows.length < $scope.MAX_URLS ? inputRows.length : $scope.MAX_URLS;
        var newUrls = false;

        for (var i = 0; i < rowLimit; i++) {
            var address = inputRows[i];
           
            // Skip empty lines 
            if(!address)
                continue;

            // If this URL has been submitted already by this user, update its state
            var url = getUrlByAddress(address);

            if(url) {
                // No need to resubmit if the request is still being processed
                if(url.state != $scope.STATE_PROCESSED)
                    continue;

                requestList.push({"batchId": url.batch.id, "address": url.address});
                url.resubmit();
            }
            else { 
                requestList.push({"batchId": newBatch.id, "address": address});
                newUrls = true;
            }
        }

        // Send the data to PHP back-end via POST request
        if(requestList.length > 0) {
            $http.post('http://' + serverHost + '/hrc2/request', JSON.stringify(requestList)).success(function(data, status, headers, config) {
                // Back-end returns list of submitted URLs together with their IDs
                data.forEach(function(url) {
                    if(!getUrlByAddress(url.address)) {
                        createNewUrl(url.address, url.id, newBatch);
                    }
                });
            });
        }
   
        // Add this batch to the list only if new URLs have been submitted 
        if(newUrls) {
            $scope.batches.push(newBatch);
    
            $scope.$apply();

            // Scroll to the latest batch
            $('html, body').animate({
                scrollTop: $("#batch"+newBatch.id).offset().top
            }, 1000);
        }
    

        // Update input text area to show only remaining URLs (if any)
        if(inputRows.length > $scope.MAX_URLS) { 
            $scope.totalUrls = inputRows.length - $scope.MAX_URLS;
            $scope.input = inputRows.slice($scope.MAX_URLS).join("\n");
        }
        else {
            $scope.totalUrls = 0;
            $scope.input = "";
        }
        
        $scope.$apply();

    }; // End of submitData

    // Update row count when input is changed
    $scope.onInputChange = function () {
        if($scope.input == '') {
           $scope.totalUrls = 0;
        }
        else {
            inputRows = $scope.input.split("\n");
            $scope.totalUrls = inputRows.length;
        }
    }

    // Returns URL object for the given URL address
    function getUrlByAddress (address) {
        return $scope.addressToUrl[address];
    }

    // A helper function for creating new URL objects
    function createNewUrl(address, id, batch, parentUrl) {
        var newUrl = new Url(address, id, batch, parentUrl);

        $scope.addressToUrl[address] = newUrl;

        if(!parentUrl) {
            batch.urls.push(newUrl);
        }

        return newUrl;
    }

    // Get existing batch with the given ID or create a new one
    function getOrCreateBatch (batchId) {
       if($scope.batches[batchId]) { 
            return $scope.batches[batchId];
        }

        var batch = new Batch(batchId); 
        $scope.batches[batchId] = batch;

        return batch;
    }

    // Batch class for storing data about sets of submitted URLs
    var Batch = function Batch (batchId) {
        this.id = batchId || $scope.batches.length;
        this.processedUrls = 0
        this.urls = [];

        // Returns a list of all URLs from this batch together with their redirect URLs
        this.getUrls = function () {
            var urlList = [];

            // Sort the URLs by their IDs to make sure they are displayed in the 
            // same order as they were submitted 
            this.urls.sort(function(a,b) {return (a.id > b.id) ? 1 : -1;} );

            for (var i=0; i < this.urls.length; i++){
                var cur = this.urls[i];
                cur.index = i + 1;
                urlList.push(cur);
    
                var redir = cur.redirectTo;

                while(redir) {
                    urlList.push(redir);
                    redir = redir.redirectTo;
                }
            }

            return urlList;
        }

        // Returns current progress (in %) for this batch
        this.getPercentageDone = function () {
            return Math.floor((this.processedUrls / this.urls.length) * 100);
        }
    }

    // URL class
    var Url = function Url (address, id, batch, parentUrl) {
        this.address = address; 
        this.id = id;
        this.batch = batch;
        this.parentUrl = parentUrl || null;
        this.state = $scope.STATE_WAITING_RESPONSE;

        // Has this URL been processed yet?
        this.isProcessed = function () {
            return this.state != $scope.STATE_WAITING_RESPONSE;
        }

        // Returns true if this URL comes from redirection
        this.isRedirect = function () {
            return this.parentUrl != null;
        }

        // Set the state of this URL and all its parents to 'processed'
        this.setToProcessed = function () {
            this.state = $scope.STATE_PROCESSED;

            // If this URL was a redirect, update state for all of its parents
            var cur = this.parentUrl;

            while(cur) {
                cur.state = $scope.STATE_PROCESSED;
                cur = cur.parentUrl;
            }

            this.batch.processedUrls++;
        }

        // Set redirect location for this URL and create new URL object for the redirect
        this.setRedirectTo = function (redirLocation) {
            this.state = $scope.STATE_WAITING_REDIRECT;

            var redirUrl = createNewUrl(redirLocation, null, this.batch, this);
            this.redirectTo = redirUrl;
        }
      
        // Update the state when URL has been resubmitted for processing 
        this.resubmit = function () {
            this.state = $scope.STATE_WAITING_RESPONSE;
            this.batch.processedUrls--;
        }

        // Update current state for this URL with response data received from the back-end 
        this.updateState = function (responseCode, contentLength, redirLocation) {
            this.responseCode = responseCode;
            this.contentLength = contentLength;

            if(redirLocation != 'undefined') {
                this.setRedirectTo(redirLocation);
            }
            else if(responseCode != 'undefined') {
                this.setToProcessed();
            }
        }

        // Returns detailed response information for this URL's response code
        this.getResponseData = function () {
            return $scope.HTTP_STATUS[this.responseCode];
        }

    } 

    // Get status color based on the response code
    $scope.responseColor = function(responseCode) {
        if(responseCode == 0)
           return COLOR_RED;

        if(responseCode < 300)
           return COLOR_GREEN;

        if(responseCode < 400)
            return COLOR_ORANGE;

        return COLOR_RED;
    }

    // Constants 
    var COLOR_GREEN = '#4CA832';
    var COLOR_ORANGE = '#F27A24';
    var COLOR_RED = '#D62020';
    $scope.STATE_WAITING_RESPONSE = 0;
    $scope.STATE_WAITING_REDIRECT = 1;
    $scope.STATE_PROCESSED = 2;

    // HTTP response codes and explanations. Mosty based on http://en.wikipedia.org/wiki/List_of_HTTP_status_codes
    $scope.HTTP_STATUS = {
        0  : {'text': 'Didn\'t resolve', 'explanation': 'Hostname doesn\'t exist or the server is currently unavailable'}, 
        100 : {'text': 'Continue', 'explanation': 'You shouldn\t be seeing this'},
        101 : {'test': 'Switching Protocols', 'explanation': 'You shouldn\t be seeing this'},
        102 : {'test': 'Processing', 'explanation': 'You shouldn\t be seeing this'},
        200 : {'text': 'OK', 'explanation': 'Standard response for successful HTTP requests.'},
        201 : {'text': 'Created', 'explanation': 'The request has been fulfilled and resulted in a new resource being created'},
        202 : {'text': 'Accepted', 'explanation': 'The request has been accepted for processing, but the processing has not been completed.'},
        203 : {'text': 'Non-Authoritative Information', 'explanation': 'The server successfully processed the request, but is returning information that may be from another source.'},
        204 : {'text': 'No Content', 'explanation': 'The server successfully processed the request, but is not returning any content.'},
        205 : {'text': 'Reset Content', 'explanation': 'The server successfully processed the request, but is not returning any content.'},
        206 : {'text': 'Partial Content', 'explanation': 'The server is delivering only part of the resource due to a range header sent by the client.'},
        207 : {'text': 'Multi-Status', 'explanation': 'The server is delivering only part of the resource due to a range header sent by the client.'},
        300 : {'text': 'Multiple Choices', 'explanation': 'Indicates multiple options for the resource that the client may follow.'},
        301 : {'text': 'Moved Permanently', 'explanation': 'The page has been permanently moved to a new location.'},
        302 : {'text': 'Found', 'explanation': 'The page has been temporarily moved to a new location.'},
        303 : {'text': 'See Other', 'explanation': 'The response to the request can be found under another URI using a GET method.'},
        304 : {'text': 'Not Modified', 'explanation': 'Indicates that the resource has not been modified since the version specified by the request headers.'},
        305 : {'text': 'Use Proxy', 'explanation': 'The requested resource is only available through a proxy.'},
        307 : {'text': 'Temporary Redirect', 'explanation': 'The request should be repeated with another URI; however, future requests should still use the original URI.'},
        308 : {'text': 'Permanent Redirect', 'explanation': 'The request, and all future requests should be repeated using another URI.'},
        400 : {'text': 'Bad Request', 'explanation': 'The request could not be understood by the server due to malformed syntax.'},
        401 : {'text': 'Unauthorized', 'explanation': 'Used when authentication is required and has failed or has not yet been provided.'},
        403 : {'text': 'Forbidden', 'explanation': 'The client doesn\'t have permission to access the resource.'},
        404 : {'text': 'Not Found', 'explanation': 'The requested resource could not be found but may be available again in the future.'},
        405 : {'text': 'Method Not Allowed', 'explanation': 'A request was made of a resource using a request method not supported by that resource.'},
        407 : {'text': 'Proxy Authentication Required', 'explanation': 'The client must first authenticate itself with the proxy.'},
        408 : {'text': 'Request Timeout', 'explanation': 'The server timed out waiting for the request.'},
        409 : {'text': 'Conflict', 'explanation': 'Indicates that the request could not be processed because of conflict in the request, such as an edit conflict in the case of multiple updates.'},
        410 : {'text': 'Gone', 'explanation': 'Indicates that the resource requested is no longer available and will not be available again.'},
        411 : {'text': 'Length Required', 'explanation': 'The request did not specify the length of its content, which is required by the requested resource.'},
        412 : {'text': 'Precondition Failed', 'explanation': 'The server does not meet one of the preconditions that the requester put on the request.'},
        413 : {'text': 'Request Entity Too Large', 'explanation': 'The request is larger than the server is willing or able to process.'},
        414 : {'text': 'Request-URI Too Long', 'explanation': 'The request is larger than the server is willing or able to process.'},
        416 : {'text': 'Requested Range Not Satisfiable', 'explanation': 'The client has asked for a portion of the file, but the server cannot supply that portion.'},
        417 : {'text': 'Expectation Failed', 'explanation': 'The server cannot meet the requirements of the Expect request-header field.'},
        423 : {'text': 'Locked', 'explanation': 'The resource that is being accessed is locked.'},
        424 : {'text': 'Failed Dependency', 'explanation': 'The request failed due to failure of a previous request.'},
        426 : {'text': 'Upgrade Required', 'explanation': 'The client should switch to a different protocol such as TLS/1.0.'},
        500 : {'text': 'Internal Server Error', 'explanation': 'A generic error message, given when an unexpected condition was encountered and no more specific message is suitable.'},
        501 : {'text': 'Not Implemented', 'explanation': 'The server either does not recognize the request method, or it lacks the ability to fulfill the request.'},
        502 : {'text': 'Bad Gateway', 'explanation': 'The server was acting as a gateway or proxy and received an invalid response from the upstream server.'},
        503 : {'text': 'Service Unavailable', 'explanation': 'The server is currently unavailable (because it is overloaded or down for maintenance).'},
        504 : {'text': 'Gateway Timeout', 'explanation': 'The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.'},
        505 : {'text': 'HTTP Version Not Supported', 'explanation': 'The server does not support the HTTP protocol version used in the request.'},
        506 : {'text': 'Variant Also Negotiates', 'explanation': 'Transparent content negotiation for the request results in a circular reference.'},
        507 : {'text': 'Insufficient Storage', 'explanation': 'The server is unable to store the representation needed to complete the request.'},
        509 : {'text': 'Bandwidth Limit Exceeded', 'explanation': 'Server\s allocated data transfer has been exceeded.'},
        510 : {'text': 'Not Extended', 'explanation': 'Further extensions to the request are required for the server to fulfill it.'}
    };
});
