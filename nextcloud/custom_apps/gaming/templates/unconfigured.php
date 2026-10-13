<?php
/** @var \OCP\IL10N $l */
?>
<div id="gaming-app" class="emptycontent">
	<h2><?php p($l->t('La app de juegos todavía no está configurada')); ?></h2>
	<p><?php p($l->t('Un administrador tiene que indicar la URL de los juegos:')); ?></p>
	<pre>occ config:app:set gaming games_url --value="https://games.example.com/bookmarks"</pre>
</div>
