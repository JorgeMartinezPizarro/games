<?php
/** @var \OCP\IL10N $l */
?>
<div id="gaming-app" class="emptycontent">
	<h2><?php p($l->t('The games app is not configured yet')); ?></h2>
	<p><?php p($l->t('An administrator has to set the URL of the games:')); ?></p>
	<pre>occ config:app:set gaming games_url --value="https://games.example.com/bookmarks"</pre>
</div>
