// Native messaging host for the Quick Save Images extension.
// Frames are a uint32 little-endian length followed by UTF-8 JSON, in both directions.
// The host serves frames until the browser closes stdin, so it never exits before its reply is read.
// Written for the C# 5 compiler that ships with .NET Framework 4.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class QuickSaveHost
{
    const string Version = "1.0.0";
    const int MaxFrame = 256 << 20;
    const int Cancelled = unchecked((int)0x800704C7);  // HRESULT_FROM_WIN32(ERROR_CANCELLED)
    const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
    const uint SIGDN_FILESYSPATH = 0x80058000;

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    static readonly string[] ImageExtensions =
        { ".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".gif", ".webp", ".avif", ".bmp", ".ico", ".svg", ".tif", ".tiff", ".jxl" };
    static readonly Regex DeviceName =
        new Regex(@"^(con|prn|aux|nul|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3])\s*(\.|$)", RegexOptions.IgnoreCase);

    [STAThread]
    static int Main()
    {
        Stream input = Console.OpenStandardInput(), output = Console.OpenStandardOutput();
        try
        {
            string request;
            while ((request = ReadFrame(input)) != null)
                WriteFrame(output, Handle(request));
            return 0;
        }
        catch (Exception)
        {
            return 1;  // broken framing or a closed pipe: there is no one left to answer
        }
    }

    static object Handle(string request)
    {
        try
        {
            var m = Json.Deserialize<Dictionary<string, object>>(request);
            switch (Text(m, "op"))
            {
                case "ping": return new { ok = true, version = Version, pictures = Pictures() };
                case "save": return Save(Folder(Text(m, "dir")), Text(m, "name"), Convert.FromBase64String(Text(m, "data")), Text(m, "conflict") == "overwrite");
                case "pick": return Pick(Text(m, "dir"));
                case "reveal": return Reveal(Text(m, "path"));
                default: throw new ArgumentException("unknown request");
            }
        }
        catch (Exception e)
        {
            return new { ok = false, error = e.Message };
        }
    }

    static object Save(string dir, string name, byte[] data, bool overwrite)
    {
        CheckName(name);
        if (data.Length == 0) throw new ArgumentException("the image is empty");
        Directory.CreateDirectory(dir);
        string path = Path.Combine(dir, name);
        if (overwrite)
        {
            bool existed = File.Exists(path);
            File.WriteAllBytes(path, data);
            return new { ok = true, path = path, name = name, overwritten = existed };
        }
        string stem = Path.GetFileNameWithoutExtension(name), extension = Path.GetExtension(name);
        for (int i = 1; i <= 9999; i++)
        {
            FileStream file;
            try
            {
                file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            }
            catch (IOException e)
            {
                int code = e.HResult & 0xFFFF;
                if (code != 80 && code != 183) throw;  // anything but ERROR_FILE_EXISTS / ERROR_ALREADY_EXISTS
                path = Path.Combine(dir, stem + " (" + i + ")" + extension);
                continue;
            }
            try
            {
                using (file) file.Write(data, 0, data.Length);
            }
            catch
            {
                File.Delete(path);  // never leave a partial image behind
                throw;
            }
            return new { ok = true, path = path, name = Path.GetFileName(path), overwritten = false };
        }
        throw new IOException("no free file name for " + name);
    }

    // The name comes from a web page, so it must be a plain image file name and nothing else.
    static void CheckName(string name)
    {
        bool refused = name.Length == 0 || name.Length > 200
            || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || name[0] == '.' || name[0] == ' ' || name.EndsWith(".") || name.EndsWith(" ")
            || DeviceName.IsMatch(name)
            || Array.IndexOf(ImageExtensions, Path.GetExtension(name).ToLowerInvariant()) < 0;
        if (refused) throw new ArgumentException("refused file name: " + name);
    }

    static string Folder(string dir)
    {
        dir = dir.Trim();
        if (dir.Length == 0) return Pictures();
        bool drive = dir.Length >= 3 && char.IsLetter(dir[0]) && dir[1] == ':' && (dir[2] == '\\' || dir[2] == '/');
        bool share = dir.StartsWith(@"\\") && !dir.StartsWith(@"\\?\") && !dir.StartsWith(@"\\.\");
        if (!drive && !share) throw new ArgumentException("the save path must be a full folder path: " + dir);
        return Path.GetFullPath(dir);
    }

    static string Pictures()
    {
        return Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
    }

    static object Pick(string current)
    {
        var dialog = (IFileDialog)new FileOpenDialog();
        try
        {
            dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
            dialog.SetTitle("Quick save images: save path");
            IShellItem start;
            if (Directory.Exists(current) && SHCreateItemFromParsingName(current, IntPtr.Zero, typeof(IShellItem).GUID, out start) == 0)
                dialog.SetFolder(start);

            int hr;
            // The host is a background process; a topmost owner keeps the picker above the browser.
            using (var owner = new Form())
            {
                owner.ShowInTaskbar = false;
                owner.FormBorderStyle = FormBorderStyle.None;
                owner.StartPosition = FormStartPosition.Manual;
                owner.Location = Cursor.Position;
                owner.Size = new Size(1, 1);
                owner.Opacity = 0;
                owner.TopMost = true;
                owner.Show();
                owner.Activate();
                hr = dialog.Show(owner.Handle);
            }
            if (hr == Cancelled) return new { ok = false, cancelled = true };
            Marshal.ThrowExceptionForHR(hr);

            IShellItem item;
            dialog.GetResult(out item);
            string path;
            item.GetDisplayName(SIGDN_FILESYSPATH, out path);
            return new { ok = true, dir = path };
        }
        finally
        {
            Marshal.ReleaseComObject(dialog);
        }
    }

    static object Reveal(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("the file is gone: " + path);
        Process.Start("explorer.exe", "/select,\"" + Path.GetFullPath(path) + "\"");
        return new { ok = true };
    }

    static string Text(Dictionary<string, object> m, string key)
    {
        object value;
        return m != null && m.TryGetValue(key, out value) ? value as string ?? "" : "";
    }

    static string ReadFrame(Stream s)
    {
        var header = new byte[4];
        int got = Fill(s, header);
        if (got == 0) return null;  // the browser closed the port
        if (got < 4) throw new EndOfStreamException("truncated frame header");
        int length = BitConverter.ToInt32(header, 0);
        if (length < 0 || length > MaxFrame) throw new InvalidDataException("bad frame length " + length);
        var body = new byte[length];
        if (Fill(s, body) < length) throw new EndOfStreamException("truncated frame");
        return Encoding.UTF8.GetString(body);
    }

    static int Fill(Stream s, byte[] buffer)
    {
        int total = 0, n;
        while (total < buffer.Length && (n = s.Read(buffer, total, buffer.Length - total)) > 0) total += n;
        return total;
    }

    static void WriteFrame(Stream s, object reply)
    {
        byte[] body = Encoding.UTF8.GetBytes(Json.Serialize(reply));
        s.Write(BitConverter.GetBytes(body.Length), 0, 4);
        s.Write(body, 0, body.Length);
        s.Flush();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string path, IntPtr bindContext, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);
}

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class FileOpenDialog { }

// Vtable order of IModalWindow + IFileDialog, up to the last method used.
[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileDialog
{
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr sink, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem
{
    void BindToHandler(IntPtr bindContext, [MarshalAs(UnmanagedType.LPStruct)] Guid handler, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
}
