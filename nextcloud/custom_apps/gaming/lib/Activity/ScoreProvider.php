<?php

namespace OCA\Gaming\Activity;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Service\GamesUrlService;
use OCP\Activity\Exceptions\UnknownActivityException;
use OCP\Activity\IEvent;
use OCP\Activity\IProvider;
use OCP\IURLGenerator;
use OCP\IUserManager;

class ScoreProvider implements IProvider {

	public function __construct(
		private IURLGenerator $urlGenerator,
		private IUserManager $userManager,
		private GamesUrlService $games,
	) {
	}

	/**
	 * @throws UnknownActivityException
	 */
	public function parse($language, IEvent $event, ?IEvent $previousEvent = null): IEvent {
		if ($event->getApp() !== Application::APP_ID || $event->getSubject() !== 'score_saved') {
			throw new UnknownActivityException();
		}

		$params = $event->getSubjectParameters();
		$authorId = $event->getAuthor();
		$authorName = $this->userManager->getDisplayName($authorId) ?? $authorId;
		$scoreLabel = (string)($params['scoreLabel'] ?? $params['score'] ?? '?');
		$game = (string)($params['game'] ?? 'un juego');
		// Activities published before deeplinks have no path: they open the app root.
		$link = $this->games->getAppLink($params['path'] ?? null);

		$event->setParsedSubject(sprintf('%s marcó %s en %s', $authorName, $scoreLabel, $game));
		$event->setRichSubject('{user} marcó {score} en {game}', [
			'user' => ['type' => 'user', 'id' => $authorId, 'name' => $authorName],
			'score' => ['type' => 'highlight', 'id' => 'score', 'name' => $scoreLabel],
			// The web stream only makes rich parameters clickable, not the event link.
			'game' => ['type' => 'highlight', 'id' => 'game', 'name' => $game, 'link' => $link],
		]);
		$event->setIcon($this->urlGenerator->getAbsoluteURL(
			$this->urlGenerator->imagePath(Application::APP_ID, 'app-dark.svg')
		));
		$event->setLink($link);

		return $event;
	}
}
