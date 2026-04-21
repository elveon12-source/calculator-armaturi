$path = "D:\agent\calculator-armaturi\app.js"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$content = $content.Replace('Ä‚', 'ă').Replace('Ă‚', 'â').Replace('Č›', 'ț').Replace('Äƒ', 'ă').Replace('Ă', 'ă').Replace('Č™', 'ș').Replace('âś•', '✖').Replace('đź”ą', '🔷').Replace('Ă˜', 'Ø').Replace('Ä', 'ă')
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)

$path2 = "D:\agent\calculator-armaturi\sw.js"
if (Test-Path $path2) {
    $content2 = [System.IO.File]::ReadAllText($path2, [System.Text.Encoding]::UTF8)
    $content2 = $content2.Replace('Ä‚', 'ă').Replace('Ă‚', 'â').Replace('Č›', 'ț').Replace('Äƒ', 'ă').Replace('Ă', 'ă').Replace('Č™', 'ș')
    [System.IO.File]::WriteAllText($path2, $content2, [System.Text.Encoding]::UTF8)
}
