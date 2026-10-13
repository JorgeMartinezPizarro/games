<?php

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		// Deeplinks: /apps/gaming/<path> opens <games_url>/<path> inside the iframe.
		[
			'name' => 'page#index',
			'url' => '/{path}',
			'verb' => 'GET',
			'requirements' => ['path' => '.+'],
			'postfix' => 'deeplink',
		],
	],
	// Called server to server by the games app (app/lib/nextcloud/gamingApp.ts),
	// signed with the shared secret. See SignedRequestVerifier.
	'ocs' => [
		['name' => 'score#publish', 'url' => '/api/v1/score', 'verb' => 'POST'],
		['name' => 'notification#notify', 'url' => '/api/v1/notify', 'verb' => 'POST'],
	],
];
