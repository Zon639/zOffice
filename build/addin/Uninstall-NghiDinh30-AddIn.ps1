$ErrorActionPreference = "SilentlyContinue"

$keysToRemove = @(
    "HKCU:\Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect",
    "HKCU:\Software\Classes\NghiDinh30.WordAddIn.Connect",
    "HKCU:\Software\Classes\NghiDinh30.WordAddIn.TaskPaneControl",
    "HKCU:\Software\Classes\CLSID\{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}",
    "HKCU:\Software\Classes\CLSID\{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}",
    "HKCU:\Software\Classes\WOW6432Node\CLSID\{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}",
    "HKCU:\Software\Classes\WOW6432Node\CLSID\{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}"
)

foreach ($k in $keysToRemove) {
    if (Test-Path $k) {
        Remove-Item -Path $k -Recurse -Force
    }
}
Write-Output "UNINSTALLED"
