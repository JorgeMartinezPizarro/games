<?php

namespace OCA\Gaming\Activity;

use OCP\Activity\ISetting;

class ScoreSetting implements ISetting {

    public function getIdentifier(): string {
        return 'score';
    }

    public function getName(): string {
        return 'Puntuaciones de juegos';
    }

    public function getPriority(): int {
        return 50;
    }

    public function canChangeStream(): bool {
        return true;
    }

    public function isDefaultEnabledStream(): bool {
        return true;
    }

    public function canChangeMail(): bool {
        return false;
    }

    public function isDefaultEnabledMail(): bool {
        return false;
    }
}
