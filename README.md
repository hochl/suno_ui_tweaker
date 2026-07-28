# Suno UI Tweaker Bookmarklet

A bookmarklet that tweaks the Suno website. Current changes:

- display main window in full width.
- increase the size of the audio player.
- make play icons transparent so they do not hide the song cover.
- display plays, likes and followers as full numbers and not just abbreviations.
- remove carousel and replace it with (possibly newly created and somewhat worse) cards.

# How to use this bookmarklet? <br><sub>(tested with both Edge and Chrome on Windows)</sub>

1) Create a new bookmark, for example by pressing CTRL+D inside the browser
   window.

2) Choose a suitable name for the bookmark like "Suno UI Tweaker". Then set the
   destination to "Bookmark Bar" or "Favoritenleiste".

3) Replace the URL field with the code from "loader.txt". You might have to
   click "More..." or "Mehr..." to see the URL field. As a test you may use the
   following code that displays a text box:

    javascript:(function(){alert('Hello%20World!');})();

4) You can always edit this bookmarklet and change the URL to the latest
   bookmarklet code from this repository.

5) Save the code from "suno_tweaks.js" to your local hard drive.

6) On page load, click the bookmarklet. It will prompt you for a file, select
   "suno_tweaks.js" that you have downloaded earlier.

# Usage

The bookmarklet is not active automatically! After loading or reloading the
Suno website, just click on the bookmark in the bookmark bar to activate it.
Since Suno constantly *improves* their website the bookmarklet needs frequent
updates :(
