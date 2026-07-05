<?php
return [
    'routes' => [
        [
            'name' => 'page#index',
            'url' => '/',
            'verb' => 'GET',
        ],
        [
            'name' => 'score#publish',
            'url' => '/api/score',
            'verb' => 'POST',
        ],
    ],
];