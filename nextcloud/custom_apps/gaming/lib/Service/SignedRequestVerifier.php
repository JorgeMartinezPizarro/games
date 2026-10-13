<?php

namespace OCA\Gaming\Service;

use OCA\Gaming\AppInfo\Application;
use OCA\Gaming\Exception\BadGamingRequestException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IAppConfig;
use OCP\IRequest;
use OCP\IUser;

/**
 * Verifies that a request really comes from the games server.
 *
 * The games server signs "<timestamp>.<raw body>" with HMAC-SHA256 and the
 * shared secret (app config "shared_secret", NEXTCLOUD_GAMING_SECRET on the
 * games side), and only does so after replaying the game server-side. The
 * signed payload never reaches the browser, so a logged-in user can no longer
 * call these endpoints directly to publish made-up scores.
 */
class SignedRequestVerifier {
	public const CONFIG_SHARED_SECRET = 'shared_secret';
	public const TIMESTAMP_HEADER = 'X-Gaming-Timestamp';
	public const SIGNATURE_HEADER = 'X-Gaming-Signature';
	/** Accepted clock difference between both servers, in seconds. */
	public const MAX_CLOCK_SKEW = 300;

	public function __construct(
		private IAppConfig $appConfig,
		private ITimeFactory $timeFactory,
	) {
	}

	/**
	 * @return array<string, mixed> the verified payload
	 * @throws BadGamingRequestException
	 */
	public function verify(IRequest $request, IUser $user): array {
		$secret = $this->appConfig->getValueString(Application::APP_ID, self::CONFIG_SHARED_SECRET);
		if ($secret === '') {
			throw new BadGamingRequestException('Gaming app is not configured', Http::STATUS_SERVICE_UNAVAILABLE);
		}

		$timestamp = $request->getHeader(self::TIMESTAMP_HEADER);
		if (!ctype_digit($timestamp) || abs($this->timeFactory->getTime() - (int)$timestamp) > self::MAX_CLOCK_SKEW) {
			throw new BadGamingRequestException('Missing or expired signature', Http::STATUS_FORBIDDEN);
		}

		// The signature covers the exact bytes sent, so read the raw body
		// instead of the parameters Nextcloud already decoded from it.
		$body = (string)file_get_contents('php://input');
		$expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
		if (!hash_equals($expected, $request->getHeader(self::SIGNATURE_HEADER))) {
			throw new BadGamingRequestException('Invalid signature', Http::STATUS_FORBIDDEN);
		}

		$payload = json_decode($body, true);
		if (!is_array($payload)) {
			throw new BadGamingRequestException('Invalid payload', Http::STATUS_BAD_REQUEST);
		}
		if (($payload['userId'] ?? null) !== $user->getUID()) {
			throw new BadGamingRequestException('Payload does not belong to the current user', Http::STATUS_FORBIDDEN);
		}

		return $payload;
	}

	/**
	 * @param array<string, mixed> $payload
	 * @throws BadGamingRequestException
	 */
	public static function string(array $payload, string $key, int $maxLength = 64): string {
		$value = $payload[$key] ?? null;
		if (!is_string($value) || $value === '' || mb_strlen($value) > $maxLength) {
			throw new BadGamingRequestException('Invalid ' . $key, Http::STATUS_BAD_REQUEST);
		}
		return $value;
	}

	/**
	 * @param array<string, mixed> $payload
	 * @throws BadGamingRequestException
	 */
	public static function number(array $payload, string $key): int|float {
		$value = $payload[$key] ?? null;
		if (!is_int($value) && !is_float($value)) {
			throw new BadGamingRequestException('Invalid ' . $key, Http::STATUS_BAD_REQUEST);
		}
		return $value;
	}
}
