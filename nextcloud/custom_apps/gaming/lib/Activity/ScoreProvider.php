<?php

namespace OCA\Gaming\Activity;

use OCP\Activity\IEvent;
use OCP\Activity\IProvider;
use OCP\IURLGenerator;
use InvalidArgumentException;

class ScoreProvider implements IProvider {

    public function __construct(
        private IURLGenerator $urlGenerator,
    ) {
    }

    public function parse($language, IEvent $event, ?IEvent $previousEvent = null) {
        if ($event->getApp() !== 'gaming') {
            throw new InvalidArgumentException();
        }

        if ($event->getSubject() === 'score_saved') {
            $params = $event->getSubjectParameters();
            $event->setParsedSubject(sprintf(
                '%s marcó %s puntos en %s',
                $event->getAuthor(),
                $params['score'] ?? '?',
                $params['game'] ?? 'un juego'
            ));
            $event->setIcon($this->urlGenerator->imagePath('gaming', 'icon.svg'));
            return $event;
        }

        throw new InvalidArgumentException();
    }
}
