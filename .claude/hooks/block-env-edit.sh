#!/bin/bash
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')

case "$tool" in
  Edit|Write|NotebookEdit)
    path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    base=$(basename -- "$path" 2>/dev/null)
    if [[ "$base" == .env* ]]; then
      jq -n '{
        continue: false,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Editing .env* files is blocked by project policy."
        }
      }'
      exit 0
    fi
    ;;
esac

exit 0
