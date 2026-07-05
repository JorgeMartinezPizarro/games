<?php

namespace OCA\Gaming\Notification;

use InvalidArgumentException;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;

class Notifier implements INotifier {

    public function __construct(
        private IFactory $l10nFactory,
        private IURLGenerator $urlGenerator,
        private IUserManager $userManager,
    ) {
    }

    public function getID(): string {
        return 'gaming';
    }

    public function getName(): string {
        return 'Gaming';
    }

    public function prepare($notification, $languageCode) {
        if ($notification->getApp() !== 'gaming') {
            throw new InvalidArgumentException();
        }

        $l = $this->l10nFactory->get('gaming', $languageCode);

        if ($notification->getSubject() === 'score_beaten') {
            $params = $notification->getSubjectParameters();

            $author = $this->userManager->get($params['author'] ?? '');
            $authorName = $author !== null ? $author->getDisplayName() : ($params['author'] ?? '?');

            $notification->setParsedSubject($l->t(
                '%1$s ha superado tu récord en %2$s con %3$s puntos (tu récord: %4$s)',
                [
                    $authorName,
                    $params['game'] ?? '?',
                    $params['score'] ?? '?',
                    $params['previousScore'] ?? '?',
                ]
            ));

            $notification->setIcon($this->urlGenerator->getAbsoluteURL(
                $this->urlGenerator->imagePath('gaming', 'icon.svg')
            ));

            return $notification;
        }

        throw new InvalidArgumentException();
    }
}
