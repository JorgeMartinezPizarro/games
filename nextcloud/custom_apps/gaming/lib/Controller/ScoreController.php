<?php

namespace OCA\Gaming\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Activity\IManager;

class ScoreController extends OCSController {

    public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IManager $activityManager,
		private IUserManager $userManager,
	) {
		parent::__construct($appName, $request);
	}

    /**
     * @NoAdminRequired
     */
    public function publish(): DataResponse {

		error_log("Gaming ScoreController::publish");

		$user = $this->userSession->getUser();

        if ($user === null) {
            return new DataResponse([
                'success' => false,
                'error' => 'Not authenticated'
            ], 401);
        }

        $game = $this->request->getParam('game');
        $score = $this->request->getParam('score');
        $scoreLabel = $this->request->getParam('scoreLabel');

		$event = $this->activityManager->generateEvent();
		$event->setApp('gaming')
			->setType('score')
			->setAuthor($user->getUID())
			->setSubject('score_saved', [
				'game' => $game,
				'score' => $score,
				'scoreLabel' => $scoreLabel,
			]);

		$this->userManager->callForSeenUsers(function ($affectedUser) use ($event) {
			$event->setAffectedUser($affectedUser->getUID());
			$this->activityManager->publish($event);
		});
        return new DataResponse([
            'success' => true,
            'user' => $user->getUID(),
            'game' => $game,
            'score' => $score,
        ]);
    }
}