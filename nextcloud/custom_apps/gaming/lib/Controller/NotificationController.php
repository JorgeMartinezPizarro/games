<?php

namespace OCA\Gaming\Controller;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Exception\BadGamingRequestException;
use OCA\Gaming\Service\GamesUrlService;
use OCA\Gaming\Service\SignedRequestVerifier;
use OCP\App\IAppManager;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Notification\IManager;

class NotificationController extends OCSController {

	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IManager $notificationManager,
		private IUserManager $userManager,
		private IAppManager $appManager,
		private ITimeFactory $timeFactory,
		private SignedRequestVerifier $verifier,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Tells another player that the current user beat their record.
	 */
	#[NoAdminRequired]
	public function notify(): DataResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new DataResponse(['success' => false, 'error' => 'Not authenticated'], Http::STATUS_UNAUTHORIZED);
		}

		try {
			$payload = $this->verifier->verify($this->request, $user);

			$targetUserId = SignedRequestVerifier::string($payload, 'targetUserId');
			if ($targetUserId === $user->getUID()) {
				throw new BadGamingRequestException('Cannot notify yourself', Http::STATUS_BAD_REQUEST);
			}
			$target = $this->userManager->get($targetUserId);
			if ($target === null || !$target->isEnabled() || !$this->appManager->isEnabledForUser(Application::APP_ID, $target)) {
				throw new BadGamingRequestException('Unknown targetUserId', Http::STATUS_BAD_REQUEST);
			}

			$subjectParameters = [
				'game' => SignedRequestVerifier::string($payload, 'game'),
				'score' => SignedRequestVerifier::number($payload, 'score'),
				'scoreLabel' => SignedRequestVerifier::string($payload, 'scoreLabel'),
				'previousScore' => SignedRequestVerifier::number($payload, 'previousScore'),
				'previousScoreLabel' => SignedRequestVerifier::string($payload, 'previousScoreLabel'),
				'author' => $user->getUID(),
				'path' => GamesUrlService::normalizePath($payload['path'] ?? null),
			];
		} catch (BadGamingRequestException $e) {
			return new DataResponse(['success' => false, 'error' => $e->getMessage()], $e->getStatus());
		}

		$notification = $this->notificationManager->createNotification();
		$notification->setApp(Application::APP_ID)
			->setUser($target->getUID())
			->setDateTime($this->timeFactory->getDateTime())
			->setObject('score', uniqid('', true))
			->setSubject('score_beaten', $subjectParameters);

		$this->notificationManager->notify($notification);

		return new DataResponse(['success' => true]);
	}
}
