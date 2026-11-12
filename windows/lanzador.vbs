Option Explicit

Dim fso, shell, baseDir, puerto, url, noOpen, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
puerto = LeerPuerto(baseDir)
url = "http://127.0.0.1:" & puerto
noOpen = False

For i = 0 To WScript.Arguments.Count - 1
    If LCase(WScript.Arguments(i)) = "--no-open" Then noOpen = True
Next

If Not ServicioActivo(url) Then
    If Not IniciarServicio(baseDir) Then
        MsgBox "No se pudo iniciar el servicio. Revisa la carpeta logs.", vbCritical, "CXC WhatsApp"
        WScript.Quit 1
    End If

    If Not EsperarServicio(url, 40) Then
        MsgBox "El servicio no respondio a tiempo. Revisa la carpeta logs.", vbCritical, "CXC WhatsApp"
        WScript.Quit 1
    End If
End If

If Not noOpen Then
    AbrirNavegador url
End If

Function LeerPuerto(carpeta)
    Dim archivo, linea, valor, posIgual
    LeerPuerto = 3001

    On Error Resume Next
    If fso.FileExists(carpeta & "\.env") Then
        Set archivo = fso.OpenTextFile(carpeta & "\.env", 1, False)
        Do Until archivo.AtEndOfStream
            linea = Trim(archivo.ReadLine)
            If InStr(1, linea, "PANEL_PORT", vbTextCompare) = 1 Then
                posIgual = InStr(linea, "=")
                If posIgual > 0 Then
                    valor = Trim(Mid(linea, posIgual + 1))
                    valor = Replace(valor, """", "")
                    If IsNumeric(valor) Then
                        If CLng(valor) > 0 And CLng(valor) < 65536 Then
                            LeerPuerto = CInt(valor)
                        End If
                    End If
                End If
            End If
        Loop
        archivo.Close
    End If
    Err.Clear
    On Error GoTo 0
End Function

Function ServicioActivo(url)
    Dim http
    ServicioActivo = False

    On Error Resume Next
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    If http Is Nothing Then Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", url & "/api/salud", False
    http.Send
    If Err.Number = 0 Then
        If http.Status = 200 Then ServicioActivo = True
    End If
    Err.Clear
    On Error GoTo 0
End Function

Function IniciarServicio(carpeta)
    Dim pm2, comando, codigo, q
    IniciarServicio = False
    q = Chr(34)

    pm2 = carpeta & "\node_modules\.bin\pm2.cmd"
    If Not fso.FileExists(pm2) Then
        MsgBox "Falta instalar el servicio. Ejecuta instalar-windows.bat.", vbExclamation, "CXC WhatsApp"
        Exit Function
    End If

    On Error Resume Next
    comando = q & pm2 & q & " startOrReload " & q & carpeta & "\ecosystem.config.js" & q
    codigo = shell.Run(comando, 0, True)
    If codigo = 0 Then
        shell.Run q & pm2 & q & " save", 0, True
        IniciarServicio = True
    End If
    If Err.Number <> 0 Then Err.Clear
    On Error GoTo 0
End Function

Function EsperarServicio(url, intentos)
    Dim i
    EsperarServicio = False

    For i = 1 To intentos
        If ServicioActivo(url) Then
            EsperarServicio = True
            Exit Function
        End If
        WScript.Sleep 500
    Next
End Function

Sub AbrirNavegador(url)
    Dim candidatos, i, ruta, q
    q = Chr(34)

    candidatos = Array( _
        shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
        shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
        shell.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe", _
        shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
        shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe" _
    )

    For i = 0 To UBound(candidatos)
        ruta = candidatos(i)
        If fso.FileExists(ruta) Then
            shell.Run q & ruta & q & " " & q & url & q, 1, False
            Exit Sub
        End If
    Next

    shell.Run url, 1, False
End Sub
