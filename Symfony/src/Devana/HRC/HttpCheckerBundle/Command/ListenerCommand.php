<?php

namespace Devana\HRC\HttpCheckerBundle\Command;

use Symfony\Bundle\FrameworkBundle\Command\ContainerAwareCommand;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Input\InputOption;

/* A console command for starting React socket listener service 
   To run, execute 'app/console hrc:listener' */
class ListenerCommand extends ContainerAwareCommand {
    protected function configure() {
        $this->setName('hrc:listener')
            ->setDescription('Websocket listener')
            ->addOption('port', 'p', InputOption::VALUE_REQUIRED, 'Port', 8080)
            ->addOption('interface', 'i', InputOption::VALUE_REQUIRED, 'Interface', '127.0.0.1');
    }

    protected function execute(InputInterface $input, OutputInterface $output)
    {
        // Initialize React's event loop
        $loop = \React\EventLoop\Factory::create();
    
        // Initialize and start socket server
        $socketServer = new \React\Socket\Server($loop);
        $socketServer->listen($input->getOption('port'), $input->getOption('interface'));

        // Initialize socket listener
        $socketListener = $this->getContainer()->get('socket_listener');
        $socketListener->init($loop);

        // Start React's WebSocket server and run the event loop
        $webServer = new \Ratchet\Server\IoServer(
            new \Ratchet\Http\HttpServer(
                new \Ratchet\WebSocket\WsServer(
                    $socketListener
                )
            ),
            $socketServer
        );

        $loop->run();
    }
}
