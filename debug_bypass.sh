#!/bin/bash
echo "Step 1: Initial fetch"
BODY=$(curl -s -H "User-Agent: Mozilla/5.0" https://cs.rin.ru/forum/index.php)
TOKEN=$(echo "$BODY" | grep -oP 'securitytoken=\K[^;"]+')
EXP=$(echo "$BODY" | grep -oP 'securitytoken_expiration=\K[^;"]+')
echo "TOKEN: $TOKEN"
echo "EXP: $EXP"

if [ -z "$TOKEN" ]; then echo "No token found."; exit 1; fi

COOKIE="securitytoken=$TOKEN; securitytoken_expiration=$EXP"
echo "Step 2: Security Check"
curl -s -o /dev/null -H "User-Agent: Mozilla/5.0" -b "$COOKIE" https://cs.rin.ru/securitycheck/forum/index.php
echo "Waiting 2 seconds..."
sleep 2

echo "Step 3: Re-visiting Board"
curl -s -b "$COOKIE" -H "User-Agent: Mozilla/5.0" https://cs.rin.ru/forum/index.php | grep -i "Board index" | head -n 1
