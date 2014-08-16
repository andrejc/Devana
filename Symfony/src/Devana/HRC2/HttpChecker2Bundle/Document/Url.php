<?php

namespace Devana\HRC2\HttpChecker2Bundle\Document;

use Doctrine\ODM\MongoDB\Mapping\Annotations as MongoDB;

/**
 * @MongoDB\Document
 */
class Url implements \JsonSerializable {
    /**
     * @MongoDB\Id
     */
    protected $id;

    /**
     * @MongoDB\String
     */
    protected $address;

    /**
     * @MongoDB\String
     */
    protected $sessionId;

    /**
     * @MongoDB\Int
     */
    protected $batchId;

    /**
     * @MongoDB\Int
     */
    protected $responseCode;  

    /**
     * @MongoDB\Int
     */
    protected $contentLength;

    /**
     * @MongoDB\String
     */
    protected $redirLocation;

    /**
     * Get id
     *
     * @return id $id
     */
    public function getId()
    {
        return $this->id;
    }

    /**
     * Set address
     *
     * @param string $address
     * @return self
     */
    public function setAddress($address)
    {
        $this->address = $address;
        return $this;
    }

    /**
     * Get address
     *
     * @return string $address
     */
    public function getAddress()
    {
        return $this->address;
    }

    /**
     * Set responseCode
     *
     * @param int $responseCode
     * @return self
     */
    public function setResponseCode($responseCode)
    {
        $this->responseCode = $responseCode;
        return $this;
    }

    /**
     * Get responseCode
     *
     * @return int $responseCode
     */
    public function getResponseCode()
    {
        return $this->responseCode;
    }

    /**
     * Set contentLength
     *
     * @param int $contentLength
     * @return self
     */
    public function setContentLength($contentLength)
    {
        $this->contentLength = $contentLength;
        return $this;
    }

    /**
     * Get contentLength
     *
     * @return int $contentLength
     */
    public function getContentLength()
    {
        return $this->contentLength;
    }

    /**
     * Set redirLocation
     *
     * @param string $redirLocation
     * @return self
     */
    public function setRedirLocation($redirLocation)
    {
        $this->redirLocation = $redirLocation;
        return $this;
    }

    /**
     * Get redirLocation
     *
     * @return string $redirLocation
     */
    public function getRedirLocation()
    {
        return $this->redirLocation;
    }

    /**
     * Set sessionId
     *
     * @param string $sessionId
     * @return self
     */
    public function setSessionId($sessionId)
    {
        $this->sessionId = $sessionId;
        return $this;
    }

    /**
     * Get sessionId
     *
     * @return string $sessionId
     */
    public function getSessionId()
    {
        return $this->sessionId;
    }

    /**
     * Set batchId
     *
     * @param int $batchId
     * @return self
     */
    public function setBatchId($batchId)
    {
        $this->batchId = $batchId;
        return $this;
    }

    /**
     * Get batchId
     *
     * @return int $batchId
     */
    public function getBatchId()
    {
        return $this->batchId;
    }

    // Restore URL's state to the initial one
    function resubmit() {
        $this->setResponseCode(null);
        $this->setContentLength(null);
        $this->setRedirLocation(null);
    }

    function jsonSerialize() {
        return Array('address' => $this->address, 'id' => $this->id, 'batchId' => $this->batchId, 'sessionId' => $this->sessionId);
    }
}
