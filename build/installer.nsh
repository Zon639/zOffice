!macro RegisterNd30Clsid ROOT_KEY CLSID FULL_CLASS PROG_ID IS_CONTROL
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}" "" "${FULL_CLASS}"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "" "mscoree.dll"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "ThreadingModel" "Both"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "Class" "${FULL_CLASS}"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "Assembly" "NghiDinh30.WordAddIn, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "RuntimeVersion" "v4.0.30319"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32" "CodeBase" "$4"

  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32\1.0.0.0" "Class" "${FULL_CLASS}"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32\1.0.0.0" "Assembly" "NghiDinh30.WordAddIn, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32\1.0.0.0" "RuntimeVersion" "v4.0.30319"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\InprocServer32\1.0.0.0" "CodeBase" "$4"

  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\ProgId" "" "${PROG_ID}"
  WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\Implemented Categories\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}" "" ""

  !if ${IS_CONTROL} == 1
    WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\Control" "" ""
    WriteRegStr HKCU "${ROOT_KEY}\${CLSID}\Implemented Categories\{40FC6ED4-2438-11CF-A3DB-080036F12502}" "" ""
  !endif
!macroend

!macro customInstall
  ; Register Word Add-in Nghi dinh 30/2020/ND-CP for current user (both 64-bit and 32-bit Office)
  StrCpy $0 "$INSTDIR\resources\addin\NghiDinh30.WordAddIn.dll"
  IfFileExists "$0" 0 __zoffice_nd30_done
    StrCpy $1 ""
    StrCpy $2 0
    __zoffice_nd30_loop_slash:
      StrCpy $3 $0 1 $2
      StrCmp $3 "" __zoffice_nd30_done_slash
      StrCmp $3 "\" 0 +2
        StrCpy $3 "/"
      StrCpy $1 "$1$3"
      IntOp $2 $2 + 1
      Goto __zoffice_nd30_loop_slash
    __zoffice_nd30_done_slash:
    StrCpy $4 "file:///$1"

    WriteRegStr HKCU "Software\Classes\NghiDinh30.WordAddIn.Connect" "" "NghiDinh30.WordAddIn.NghiDinh30Connect"
    WriteRegStr HKCU "Software\Classes\NghiDinh30.WordAddIn.Connect\CLSID" "" "{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}"

    WriteRegStr HKCU "Software\Classes\NghiDinh30.WordAddIn.TaskPaneControl" "" "NghiDinh30.WordAddIn.UI.TaskPaneControl"
    WriteRegStr HKCU "Software\Classes\NghiDinh30.WordAddIn.TaskPaneControl\CLSID" "" "{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}"

    !insertmacro RegisterNd30Clsid "Software\Classes\CLSID" "{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}" "NghiDinh30.WordAddIn.NghiDinh30Connect" "NghiDinh30.WordAddIn.Connect" 0
    !insertmacro RegisterNd30Clsid "Software\Classes\WOW6432Node\CLSID" "{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}" "NghiDinh30.WordAddIn.NghiDinh30Connect" "NghiDinh30.WordAddIn.Connect" 0

    !insertmacro RegisterNd30Clsid "Software\Classes\CLSID" "{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}" "NghiDinh30.WordAddIn.UI.TaskPaneControl" "NghiDinh30.WordAddIn.TaskPaneControl" 1
    !insertmacro RegisterNd30Clsid "Software\Classes\WOW6432Node\CLSID" "{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}" "NghiDinh30.WordAddIn.UI.TaskPaneControl" "NghiDinh30.WordAddIn.TaskPaneControl" 1

    WriteRegStr HKCU "Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect" "FriendlyName" "Kiem tra va Chuan hoa Van ban Nghi dinh 30/2020/ND-CP"
    WriteRegStr HKCU "Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect" "Description" "Add-in kiem tra, tu dong sua loi va tao mau van ban hanh chinh theo Nghi dinh 30/2020/ND-CP"
    WriteRegDWORD HKCU "Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect" "LoadBehavior" 3
  __zoffice_nd30_done:
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Microsoft\Office\Word\Addins\NghiDinh30.WordAddIn.Connect"
  DeleteRegKey HKCU "Software\Classes\NghiDinh30.WordAddIn.Connect"
  DeleteRegKey HKCU "Software\Classes\NghiDinh30.WordAddIn.TaskPaneControl"
  DeleteRegKey HKCU "Software\Classes\CLSID\{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}"
  DeleteRegKey HKCU "Software\Classes\CLSID\{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}"
  DeleteRegKey HKCU "Software\Classes\WOW6432Node\CLSID\{8A31F950-7C4E-4D12-B890-5E2F1A9C6D34}"
  DeleteRegKey HKCU "Software\Classes\WOW6432Node\CLSID\{D1A98F42-3C7E-4B19-9E55-A67F2C81B039}"
!macroend
