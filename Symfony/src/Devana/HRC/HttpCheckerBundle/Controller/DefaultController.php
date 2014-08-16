<?php

namespace Devana\HRC\HttpCheckerBundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;

/* Default controller for rendering index page */
class DefaultController extends Controller
{
    public function indexAction()
    {
        return $this->render('HttpCheckerBundle:Default:index.html.twig');
    }
}
