<?php

namespace OCA\Gaming\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
    public function __construct() {
        parent::__construct('gaming');
    }
}
