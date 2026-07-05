<?php

namespace OCA\Gaming\AppInfo;

use OCA\Gaming\Activity\ScoreProvider;
use OCA\Gaming\Activity\ScoreSetting;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
    public function __construct() {
        parent::__construct('gaming');
    }

    public function register(IRegistrationContext $context): void {
        $context->registerActivitySetting(ScoreSetting::class);
        $context->registerActivityProvider(ScoreProvider::class);
    }

    public function boot(IBootContext $context): void {
    }
}
