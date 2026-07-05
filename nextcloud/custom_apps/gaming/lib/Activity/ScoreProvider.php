<?php

namespace OCA\Gaming\Activity;

use OCP\Activity\Exceptions\UnknownActivityException;
use OCP\Activity\IEvent;
use OCP\Activity\IProvider;
use OCP\IURLGenerator;

class ScoreProvider implements IProvider {

    public function __construct(
        private IURLGenerator $urlGenerator,
    ) {
    }

    /**
     * @throws UnknownActivityException
     */
    public function parse($language, IEvent $event, ?IEvent $previousEvent = null) {
        if ($event->getApp() !== 'gaming') {
            throw new UnknownActivityException();
        }

        if ($event->getSubject() === 'score_saved') {
            $params = $event->getSubjectParameters();
            $scoreLabel = $params['scoreLabel'] ?? $params['score'] ?? '?';
            $event->setParsedSubject(sprintf(
                '%s marcó %s en %s',
                $event->getAuthor(),
                $scoreLabel,
                $params['game'] ?? 'un juego'
            ));
            $event->setIcon($this->urlGenerator->imagePath('gaming', 'icon.svg'));
            return $event;
        }

        throw new UnknownActivityException();
    }
}
