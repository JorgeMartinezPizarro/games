<?php

namespace OCA\Gaming\Controller;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Exception\BadGamingRequestException;
use OCA\Gaming\Service\GamesUrlService;
use OCA\Gaming\Service\SignedRequestVerifier;
use OCP\Activity\IManager;
use OCP\App\IAppManager;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;

class ScoreController extends OCSController {

	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IManager $activityManager,
		private IUserManager $userManager,
		private IAppManager $appManager,
		private SignedRequestVerifier $verifier,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Publishes "<user> scored <score> in <game>" to the activity stream of every user of the app.
	 */
	#[NoAdminRequired]
	public function publish(): DataResponse {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new DataResponse(['success' => false, 'error' => 'Not authenticated'], Http::STATUS_UNAUTHORIZED);
		}

		try {
			$payload = $this->verifier->verify($this->request, $user);
			$subjectParameters = [
				'game' => SignedRequestVerifier::string($payload, 'game'),
				'score' => SignedRequestVerifier::number($payload, 'score'),
				'scoreLabel' => SignedRequestVerifier::string($payload, 'scoreLabel'),
				'path' => GamesUrlService::normalizePath($payload['path'] ?? null),
			];
		} catch (BadGamingRequestException $e) {
			return new DataResponse(['success' => false, 'error' => $e->getMessage()], $e->getStatus());
		}

		$event = $this->activityManager->generateEvent();
		$event->setApp(Application::APP_ID)
			->setType('score')
			->setAuthor($user->getUID())
			->setSubject('score_saved', $subjectParameters);

		$this->userManager->callForSeenUsers(function (IUser $affectedUser) use ($event): void {
			// Only users that can open the app get its activity.
			if (!$affectedUser->isEnabled() || !$this->appManager->isEnabledForUser(Application::APP_ID, $affectedUser)) {
				return;
			}
			$event->setAffectedUser($affectedUser->getUID());
			$this->activityManager->publish($event);
		});

		return new DataResponse(['success' => true]);
	}
}
