<?php

namespace OCA\Gaming\Notification;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Service\GamesUrlService;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\UnknownNotificationException;

class Notifier implements INotifier {

	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $urlGenerator,
		private IUserManager $userManager,
		private GamesUrlService $games,
	) {
	}

	public function getID(): string {
		return Application::APP_ID;
	}

	public function getName(): string {
		return 'Gaming';
	}

	public function prepare(INotification $notification, string $languageCode): INotification {
		if ($notification->getApp() !== Application::APP_ID || $notification->getSubject() !== 'score_beaten') {
			throw new UnknownNotificationException();
		}

		$l = $this->l10nFactory->get(Application::APP_ID, $languageCode);
		$params = $notification->getSubjectParameters();

		$author = $this->userManager->get($params['author'] ?? '');
		$authorName = $author !== null ? $author->getDisplayName() : ($params['author'] ?? '?');
		$scoreLabel = $params['scoreLabel'] ?? $params['score'] ?? '?';
		$previousScoreLabel = $params['previousScoreLabel'] ?? $params['previousScore'] ?? '?';

		$notification->setParsedSubject($l->t(
			'%1$s ha superado tu récord en %2$s con %3$s (tu récord: %4$s)',
			[
				$authorName,
				$params['game'] ?? '?',
				$scoreLabel,
				$previousScoreLabel,
			]
		));

		$notification->setIcon($this->urlGenerator->getAbsoluteURL(
			$this->urlGenerator->imagePath(Application::APP_ID, 'app-dark.svg')
		));
		// Notifications sent before deeplinks have no path: they open the app root.
		$notification->setLink($this->games->getAppLink($params['path'] ?? null));

		return $notification;
	}
}
