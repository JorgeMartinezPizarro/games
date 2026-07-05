<?php

namespace OCA\Gaming\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Notification\IManager;

class NotificationController extends OCSController {

    public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $userSession,
		private IManager $notificationManager,
	) {
		parent::__construct($appName, $request);
	}

    /**
     * @NoAdminRequired
     */
    public function notify(): DataResponse {

		$user = $this->userSession->getUser();

        if ($user === null) {
            return new DataResponse([
                'success' => false,
                'error' => 'Not authenticated'
            ], 401);
        }

        $targetUserId = $this->request->getParam('targetUserId');
        $game = $this->request->getParam('game');
        $score = $this->request->getParam('score');
        $previousScore = $this->request->getParam('previousScore');

        if (!is_string($targetUserId) || $targetUserId === '') {
            return new DataResponse([
                'success' => false,
                'error' => 'targetUserId is required'
            ], 400);
        }

        if ($targetUserId === $user->getUID()) {
            return new DataResponse([
                'success' => false,
                'error' => 'Cannot notify yourself'
            ], 400);
        }

		$notification = $this->notificationManager->createNotification();
		$notification->setApp('gaming')
			->setUser($targetUserId)
			->setDateTime(new \DateTime())
			->setObject('score', uniqid('', true))
			->setSubject('score_beaten', [
				'game' => $game,
				'score' => $score,
				'previousScore' => $previousScore,
				'author' => $user->getUID(),
			]);

		$this->notificationManager->notify($notification);

        return new DataResponse([
            'success' => true,
            'targetUserId' => $targetUserId,
        ]);
    }
}
