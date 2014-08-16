<?php

namespace Devana\HRC2\HttpChecker2Bundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\Session\Session;
use Devana\HRC2\HttpChecker2Bundle\Document\Url;

class DefaultController extends Controller
{
    // Render index page
    public function indexAction()
    {
        return $this->render('HttpChecker2Bundle:Default:index.html.twig');
    }

    // Start new user session
    public function sessionAction() {
        $session = new Session();
        $session->start();

        return new Response();
    }

    // Store submitted URLs to the MongoDB database
    public function requestAction() {
        // Decode URL data from the request
        $request = $this->get('request');
        $jsonData = $request->getContent();
        error_log($jsonData);
        $submittedUrls = json_decode($jsonData);

        // Get ID for the current session
        $session = new Session();
        $session->start();
        $sessionId = $session->getId();

        $createdUrls = array();
        $dm = $this->get('doctrine_mongodb')->getManager();

        // Iterate through URLs from the request and store them in the database
        foreach ($submittedUrls as $url) {
            // Check if this URL has been submitted before by the same user
            $urlObj = $this->get('doctrine_mongodb')
                ->getRepository('HttpChecker2Bundle:Url')
                ->findOneBy(array('address' => $url->address, 'sessionId' => $sessionId));

            // If not found, create new URL object, otherwise resubmit
            if(!$urlObj) {
                $urlObj = new Url();
                $urlObj->setAddress($url->address);
                $urlObj->setBatchId($url->batchId);
                $urlObj->setSessionId($sessionId);
            }
            else {
                $urlObj->resubmit();
            }
                
            array_push($createdUrls, $urlObj);
            $dm->persist($urlObj);
        }
    
        $dm->flush();

        return new Response(json_encode($submittedUrls));
    }
}
