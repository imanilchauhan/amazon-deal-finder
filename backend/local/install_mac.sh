#!/bin/zsh
# Install (or update) the 15-minute CartCrush deal checker as a launchd agent.
#   zsh backend/local/install_mac.sh            install / reload
#   zsh backend/local/install_mac.sh uninstall  remove
set -eu
LABEL="com.cartcrush.dealcheck"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="${0:A:h}/run_mac.sh"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ "${1:-}" == "uninstall" ]]; then rm -f "$PLIST"; echo "removed $LABEL"; exit 0; fi

chmod +x "$SCRIPT"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/cartcrush"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$SCRIPT</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/cartcrush/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/cartcrush/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL: runs every 15 minutes while the Mac is awake"
echo "log: ~/Library/Logs/cartcrush/dealcheck.log"
