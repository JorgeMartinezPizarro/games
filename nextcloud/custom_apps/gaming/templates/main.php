<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gaming</title>
    <?php script('gaming', 'index'); ?>
</head>
<body>

<button id="installApp" style="display: none;">📲 Install Web App</button>

<iframe
    src="https://games.ideniox.com/bookmarks"
    style="
        position: fixed;
        left: 0;
        top: 50px;
        width: 100%;
        height: calc(100vh - 50px);
        border: none;
    "
></iframe>

</body>
</html>