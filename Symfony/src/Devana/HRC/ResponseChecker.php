<?php
namespace Devana\HRC;

/* A module for issuing HTTP requests and forwarding response data to clients */
class ResponseChecker {
    
    private $httpClient;

    public function __construct($httpClient) {
        $this->httpClient = $httpClient;
    }

    // Issue HTTP requests for the given list of URLs and return responses to the given client
    public function checkUrls($client, $urls) {
        foreach ($urls as $url) {
            $this->sendHttpRequest($client, $url);
        }   
    }

    // Issue a single HTTP request using HEAD method by default
    private function sendHttpRequest($client, $url, $requestMethod = 'HEAD') {
        // Add protocol if missing and send a request
        $formattedUrl = $this->formatUrl($url);
        $request = $this->httpClient->request($requestMethod, $formattedUrl);

        // Set response listener
        $request->on('response', function ($response) use ($client, $requestMethod, $url) {
                // Extract all relevant data from the received response
                $responseCode = $response->getCode();
                $headerData = array_change_key_case($response->getHeaders(), CASE_LOWER);
                $contentLength = array_key_exists('content-length', $headerData) ? $headerData['content-length'] : null;
                $redirLocation = $this->isRedirect($responseCode) ? $headerData['location'] : null;
                $bodyLength = 0;

                if($requestMethod == 'HEAD') {
                    // Resubmit GET request in case HEAD request is not allowed 
                    // or response header doesn't contain content-length field
                    if((!array_key_exists('content-length', $headerData) && !$this->isRedirect($responseCode))
                            || $this->notAllowed($responseCode)) {
                        $this->sendHttpRequest($client, $url, 'GET');
                    }
                    else {
                        $this->handleHttpResponse($client, $url, $responseCode, $contentLength, $redirLocation);
                    }
                }
                else {
                    // Keep track of the response body length for GET requests
                    $response->on('data', function ($data) use (&$bodyLength, $url) {
                        $bodyLength += strlen($data);
                    });

                    // GET request completed, handle response
                    $response->on('end', function () use ($client, $requestMethod, $url, $responseCode, $redirLocation, &$bodyLength) {
                        $this->handleHttpResponse($client, $url, $responseCode, $bodyLength, $redirLocation);
                    });
                }
        });

        $request->on('error', function ($error, $response) use ($client, $url) {
            $this->handleHttpResponse($client, $url, 0, 0);
        });

        $request->end();
    }

    // Forward response data to the client while dealing with HTTP redirects
    private function handleHttpResponse($client, $url, $responseCode, $bodyLength, $redirLocation = "") {
        $this->sendClientResponse($client, $url, $responseCode, $bodyLength, $redirLocation);

        if($this->isRedirect($responseCode)) {
            $this->sendHttpRequest($client, $redirLocation);
        }
    }

    // Send repsonse data to the client via WebSocket connection
    private function sendClientResponse($client, $url, $responseCode, $bodyLength, $redirLocation) {
        $client->send("$url##$responseCode##$bodyLength##$redirLocation");
    } 

    // Add protocol to the given URL (defaults to 'http')
    private function formatUrl($url) {
        // Assume http:// protocol if none is given
        if(!preg_match("/^https?:\/\//", $url))
            $url = 'http://' . $url;

        return $url;
    }

    // Returns true if given response code indicates HTTP redirect
    private function isRedirect($responseCode) {
        return $responseCode == '301' || $responseCode == '302';
    }

    // Returns true if given response code indicates that request method isn't allowed
    private function notAllowed($responseCode) {
        return $responseCode == '405';
    }
}
