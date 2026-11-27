$ErrorActionPreference = "Stop"

$dllPath = Join-Path $PSScriptRoot "NghiDinh30.WordAddIn.dll"
if (-not (Test-Path $dllPath)) {
    throw "Khong tim thay file DLL: $dllPath"
}

$fullDllPath = (Resolve-Path $dllPath).Path
$codeBaseUri = "file:///" + ($fullDllPath -replace "\\", "/")
$asmFullName = "NghiDinh30.WordAddIn, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null"

function Register-ComClassHkcu {
    param(
        [string]$ProgId,
        [string]$Clsid,
        [string]$FullClassName,
        [bool]$IsUserControl = $false
    )

    $progIdKey = "HKCU:\Software\Classes\$ProgId"
    New-Item -Path $progIdKey -Force | Out-Null
    Set-ItemProperty -Path $progIdKey -Name "(Default)" -Value $FullClassName

    New-Item -Path "$progIdKey\CLSID" -Force | Out-Null
    Set-ItemProperty -Path "$progIdKey\CLSID" -Name "(Default)" -Value $Clsid

    $clsidRoots = @(
        "HKCU:\Software\Classes\CLSID",
        "HKCU:\Software\Classes\WOW6432Node\CLSID"
    )

    foreach ($root in $clsidRoots) {
        $clsidKey  = "$root\$Clsid"
        $inprocKey = "$clsidKey\InprocServer32"
        $verKey    = "$inprocKey\1.0.0.0"

        New-Item -Path $clsidKey -Force | Out-Null
        Set-ItemProperty -Path $clsidKey -Name "(Default)" -Value $FullClassName

        New-Item -Path $inprocKey -Force | Out-Null
        Set-ItemProperty -Path $inprocKey -Name "(Default)" -Value "mscoree.dll"
        Set-ItemProperty -Path $inprocKey -Name "ThreadingModel" -Value "Both"
        Set-ItemProperty -Path $inprocKey -Name "Class" -Value $FullClassName
        Set-ItemProperty -Path $inprocKey -Name "Assembly" -Value $asmFullName
        Set-ItemProperty -Path $inprocKey -Name "RuntimeVersion" -Value "v4.0.30319"
        Set-ItemProperty -Path $inprocKey -Name "CodeBase" -Value $codeBaseUri

        New-Item -Path $verKey -Force | Out-Null
        Set-ItemProperty -Path $verKey -Name "Class" -Value $FullClassName
        Set-ItemProperty -Path $verKey -Name "Assembly" -Value $asmFullName
        Set-ItemProperty -Path $verKey -Name "RuntimeVersion" -Value "v4.0.30319"
        Set-ItemProperty -Path $verKey -Name "CodeBase" -Value $codeBaseUri

        New-Item -Path "$clsidKey\ProgId" -Force | Out-Null
        Set-ItemProperty -Path "$clsidKey\ProgId" -Name "(Default)" -Value $ProgId

        New-Item -Path "$clsidKey\Implemented Categories\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}" -Force | Out-Null

        if ($IsUserControl) {
            New-Item -Path "$clsidKey\Control" -Force | Out-Null
            New-Item -Path "$clsidKey\Implemented Categories\{40FC6ED4-2438-11CF-A3DB-080036F12502}" -Force | Out-Null
        }
    }
}

Register-ComClassHkcu `
    -ProgId "NghiDinh30.WordAddIn.Connect" `
    -Clsid "{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}" `
    -FullClassName "NghiDinh30.WordAddIn.NghiDinh30Connect" `
    -IsUserControl $false

Register-ComClassHkcu `
    -ProgId "NghiDinh30.WordAddIn.TaskPaneControl" `
    -Clsid "{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}" `
    -FullClassName "NghiDinh30.WordAddIn.UI.TaskPaneControl" `
    -IsUserControl $true

$wordAddInKey = "HKCU:\Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect"
New-Item -Path $wordAddInKey -Force | Out-Null
Set-ItemProperty -Path $wordAddInKey -Name "FriendlyName" -Value "Kiem tra va Chuan hoa Van ban Nghi dinh 30/2020/ND-CP"
Set-ItemProperty -Path $wordAddInKey -Name "Description" -Value "Add-in kiem tra, tu dong sua loi va tao mau van ban hanh chinh theo Nghi dinh 30/2020/ND-CP"
New-ItemProperty -Path $wordAddInKey -Name "LoadBehavior" -Value 3 -PropertyType DWord -Force | Out-Null

Write-Output "INSTALLED:$fullDllPath"
