<?php

namespace OCA\Gaming\Exception;

/**
 * A request from the games server that must be rejected, with the HTTP status to answer.
 */
class BadGamingRequestException extends \Exception {
	public function __construct(
		string $message,
		private int $status,
	) {
		parent::__construct($message);
	}

	public function getStatus(): int {
		return $this->status;
	}
}
