'use client'

import { errorMessage } from '@/app/helpers';
import React, { useState, useEffect, useCallback } from 'react';

const TrainerComponent = () => {
  
    const post = () => {
        fetch('/home/api/post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // add here params
            }),
            })
            .then(e=>e.json())
            .then((result) => {
                if (result.success) {
                    
                    } else {
                    
                    }
            })
            .catch(e => {
                
            })
    }

    const get = () => {
        fetch('/home/api/get'/*add params here*/, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },			
        })
            .then(e=>e.json())
            .then((result) => {
                if (result.success) {
                    
                    } else {
                    
                    }
            })
            .catch(e => {
                
            })
    }

    useEffect(() => {
        
    }, [])
    
  return <>
        <h2>TODO</h2>
  </>  
}

export default TrainerComponent;
