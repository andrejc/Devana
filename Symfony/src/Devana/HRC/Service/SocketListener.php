<?php
namespace Devana\HRC\Service;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Devana\HRC\ResponseChecker;

/* Ratchet-based service for handling WebSocket connections */
class SocketListener implements MessageComponentInterface {
    protected $responseChecker;

    // Initiate DNS resolver, HTTP client and ResponseChecker module
    public function init($loop) {
        $dnsResolverFactory = new \React\Dns\Resolver\Factory();
        $dnsResolver = $dnsResolverFactory->createCached('8.8.8.8', $loop);

        $httpClientFactory = new \React\HttpClient\Factory();
        $httpClient = $httpClientFactory->create($loop, $dnsResolver);

        $this->responseChecker = new ResponseChecker($httpClient);
    }

    // Handle a list of URLs sent by the client
    public function onMessage(ConnectionInterface $client, $data) {
        $urls = explode("\n", $data);
            
        $this->responseChecker->checkUrls($client, $urls);
    }

    public function onOpen(ConnectionInterface $conn) {
        echo "New connection opened: ({$conn->resourceId})\n";
    }

    public function onClose(ConnectionInterface $conn) {
        echo "Connection {$conn->resourceId} closed\n";
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        $conn->close();
    }
}
