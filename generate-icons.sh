#!/bin/bash
# Icon Generation Script
# 
# This script uses ImageMagick to convert the SVG icon to PNG at different sizes.
# Install ImageMagick first: https://imagemagick.org/script/download.php
#
# Or use an online tool like:
# - https://realfavicongenerator.net/
# - https://favicon.io/
# - https://www.favicon-generator.org/

# If you have ImageMagick installed:
# convert icon.svg -resize 192x192 icon-192x192.png
# convert icon.svg -resize 384x384 icon-384x384.png
# convert icon.svg -resize 512x512 icon-512x512.png

echo "To generate PNG icons from the SVG:"
echo "1. Visit https://realfavicongenerator.net/"
echo "2. Upload public/icon.svg"
echo "3. Download the generated icons"
echo "4. Place icon-192x192.png, icon-384x384.png, and icon-512x512.png in public/"
echo ""
echo "Or use ImageMagick:"
echo "  convert public/icon.svg -resize 192x192 public/icon-192x192.png"
echo "  convert public/icon.svg -resize 384x384 public/icon-384x384.png"
echo "  convert public/icon.svg -resize 512x512 public/icon-512x512.png"
