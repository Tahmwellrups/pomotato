#!/bin/bash
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')

if [ "$tool" = "Bash" ]; then
  cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
  if echo "$cmd" | grep -Eq '(^|[;&|]\s*)git\s+push\b'; then
    jq -n '{
      continue: false,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "git push is blocked by project policy. Ask the user to push manually."
      }
    }'
    exit 0
  fi
fi

exit 0
