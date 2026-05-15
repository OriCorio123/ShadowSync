# ShadowSync: Real-time full body motion tracking for interactive gaming



At its core, ShadowSync was built for gamers who love PC games but don't get enough physical exercise. Our mission is to help people stay fit while playing the games they love. 

Think of ShadowSync as your **Digital Shadow**. Just like you move in real life (IRL) and your physical shadow follows your every move, the characters inside ShadowSync perfectly follow your body movements in the digital world. You have to literally swing your arms, duck, and jump to control the game—turning your standard gaming session into a full-body workout!

### 🎥 ShadowSync Gameplay Demo

<div>
  <a href="https://youtu.be/ygEYWoAwzXs?t=29s">
    <img src="https://img.youtube.com/vi/ygEYWoAwzXs/maxresdefault.jpg" alt="Working Demo" width="600">
  </a>
</div>

---

# Quick Start: How to Play Locally

Follow these steps to download ShadowSync, run it on your machine, and start playing:

**Step 1: Download the Repository**
Open your terminal and clone the repository using Git:

```bash
git clone https://github.com/OriCorio123/ShadowSync.git
```
*(Alternatively, you can go to the GitHub page, click the green "Code" button, select **Download ZIP**, and extract the files to a folder on your computer).*

**Step 2: Install Dependencies**
Navigate into the downloaded folder via your terminal and install the required Node packages:
```bash
cd ShadowSync
npm i
```

**Step 3: Add Your Games**
To add a new game to the Hub, place your game files into the `public` directory. Create a new folder for your game and make sure your main file is named `index.html`: 
`ShadowSync/public/games/<your_game_name>/index.html`

**Step 4: Launch!**
Locate and double-click the **`start.bat`** file in your main ShadowSync folder to open the interface and start playing!

---
# Developer Guide

Welcome to the ShadowSync Developer Guide. Technically, ShadowSync acts as a **Motion Server**. It tracks the player's body and broadcasts the skeleton data 60 times a second. Your job as a developer is simply to listen to this broadcast and apply the data to your game's characters or objects.

## Table of Contents
* [The Skeleton Data (Landmarks Reference)](#the-skeleton-data-landmarks-reference)
* [Integration Guides by Game Engine](#integration-guides-by-game-engine)
  * [A. Web Engines (Phaser.js, Babylon.js, Three.js)](#a-web-engines-phaserjs-babylonjs-threejs)
  * [B. Unity WebGL (Exported Web Games)](#b-unity-webgl-exported-web-games)
  * [C. External Unity (.exe)](#c-external-unity-exe)
  * [D. Godot (GDScript)](#d-godot-gdscript)

---

## The Skeleton Data (Landmarks Reference)
Regardless of what engine you use, when ShadowSync sends you data, it sends an array of **33 Landmarks**. Each landmark contains an `x`, `y`, `z`, and `visibility` score.

> [!IMPORTANT]
> The coordinates are in **meters**. `0,0,0` is located on the floor between the player's feet. The X-axis is automatically inverted so the player acts as a mirror.

*   **0** - Nose
*   **11 / 12** - Left / Right Shoulder
*   **13 / 14** - Left / Right Elbow
*   **15 / 16** - Left / Right Wrist (Hands)
*   **23 / 24** - Left / Right Hip
*   **25 / 26** - Left / Right Knee
*   **27 / 28** - Left / Right Ankle
*   **31 / 32** - Left / Right Foot Index (Toes)

---

# Integration Guides by Game Engine

Find your specific Game Engine below and follow the exact instructions for your platform.

## A. Web Engines (Phaser.js, Babylon.js, Three.js)

Web games run directly inside the ShadowSync Hub via an iframe. 

### 1. Folder Structure
You must place your game files directly into the `public/games/` directory of the ShadowSync repository.
```text
ShadowSync_Root/
  public/
    games/
      your_game_name/       <-- Create your folder here
        index.html          <-- Your game
        index.js            <-- Your game logic
        index.png           <-- The icon that will appear in the Hub menu
        assets/             <-- Your images, models, and sounds
```

### 2. Implementation Code
In your `index.html`, include Socket.io: `<script src="/socket.io/socket.io.js"></script>`. 
In your `index.js`, write the following to connect and control your game:

```javascript
// 1. Get the Session ID from the URL
const searchParams = new URLSearchParams(window.location.search);
const mySessionId = searchParams.get('session');

// 2. Connect to the local ShadowSync server
const socket = io();

// 3. Listen for the motion data
socket.on('trackingData', (data) => {
  // SECURITY: Ignore data from other players on the same server
  if (mySessionId && data.sessionId !== mySessionId) return;

  // Extract the specific body parts
  const landmarks = data.landMarkCurrent;
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  
  // Apply to your game objects
  // myCharacter.leftHand.setPosition(leftWrist.x, leftWrist.y);
});
```

---

## B. Unity WebGL (Exported Web Games)

If you build a game in Unity and export it for the Web (HTML5/WebGL), it functions exactly like a standard Web Game. However, since Unity WebGL cannot use standard C# TCP sockets, you must use a Browser-to-C# Bridge.

### 1. Folder Structure
You will place the exported files into a new folder inside `public/games/`.
```text
ShadowSync_Root/
  public/
    games/
      my_unity_game/        <-- Create your folder here (Your game name)
        index.html          <-- Your game
        Build/              <-- Contains your .wasm and .data files
        TemplateData/       <-- Unity web templates
```

### 2. Implementation Code
You inject the standard JavaScript Socket code into your generated HTML file, and use `SendMessage` to push the data into your C# script.

**Step A: In your generated `index.html` (inside the `<script>` tag):**
```javascript
// Add Socket.io before this script block
// <script src="/socket.io/socket.io.js"></script>

const socket = io();
const searchParams = new URLSearchParams(window.location.search);
const mySessionId = searchParams.get('session');

// Unity provides 'unityInstance' when the game loads
createUnityInstance(canvas, config, (progress) => {}).then((unityInstance) => {
  
  socket.on('trackingData', (data) => {
    if (mySessionId && data.sessionId !== mySessionId) return;
    
    // Convert the landmarks to a JSON string
    const jsonString = JSON.stringify(data.landMarkCurrent);
    
    // Push the string into your C# Unity Script
    unityInstance.SendMessage("ShadowSyncManager", "ReceiveTrackingData", jsonString);
  });

});
```

**Step B: In your C# `ShadowSyncManager.cs` inside Unity:**
```csharp
using UnityEngine;

public class ShadowSyncManager : MonoBehaviour
{
    // 1. Create a slot for the 3D object in the Unity Editor
    public GameObject myLeftHandObject;

    // This method is called by the JavaScript in index.html
    public void ReceiveTrackingData(string jsonString)
    {
        // Wrap the raw array in a helper class to parse it
        string wrappedJson = "{\"landmarks\":" + jsonString + "}";
        LandmarkWrapper data = JsonUtility.FromJson<LandmarkWrapper>(wrappedJson);

        // 2. Extract the specific body parts
        Landmark leftWrist = data.landmarks[15];
        
        // 3. Convert to Unity's coordinate system (Note: -y goes UP in Unity)
        Vector3 newPosition = new Vector3(leftWrist.x, -leftWrist.y, leftWrist.z);

        // 4. Apply the position to the Game Object
        if (myLeftHandObject != null) {
            myLeftHandObject.transform.position = newPosition;
        }
    }
}

[System.Serializable]
public class LandmarkWrapper { public Landmark[] landmarks; }
```

---

## C. External Unity (.exe)

Games built as desktop executables run completely independent of the ShadowSync codebase. Use a plugin like **SocketIOUnity** in C# to connect directly to the server.

### 1. Folder Structure
You can store your Unity project anywhere on your computer. 
```text
Anywhere_On_Your_PC/
  My_Unity_Project/
    Assets/
      Scripts/
        ShadowSyncReceiver.cs   <-- The script that connects to the server
```

### 2. Implementation Code
```csharp
using UnityEngine;
using SocketIOClient; 

public class ShadowSyncReceiver : MonoBehaviour
{
    private SocketIOUnity socket;
    public string mySessionId = "5521"; // In a full game, prompt the player to enter this

    // 1. Create a slot for the 3D object in the Unity Editor
    public GameObject myLeftHandObject;

    void Start()
    {
        // 1. Set this to the URL where your Hub is running
        // Use "http://localhost:3000" for local testing
        // Use "https://your-app.onrender.com" for live cloud servers
        var uri = new System.Uri("https://shadowsync.onrender.com");
        socket = new SocketIOUnity(uri);

        socket.On("trackingData", (response) => {
            string json = response.GetValue<string>();
            TrackingPayload data = JsonUtility.FromJson<TrackingPayload>(json);

            // SECURITY: Ignore other players
            if (data.sessionId != mySessionId) return;

            // 2. Extract the specific body parts
            Landmark leftWrist = data.landMarkCurrent[15];
            
            // 3. Convert to Unity's coordinate system (Note: -y goes UP in Unity)
            Vector3 newPosition = new Vector3(leftWrist.x, -leftWrist.y, leftWrist.z);

            // 4. Apply the position to the Game Object
            if (myLeftHandObject != null) {
                myLeftHandObject.transform.position = newPosition;
            }
        });

        socket.Connect();
    }
}
```

### 3. Advanced: Full-Body Mixamo Rig (Automatic Mapping)
If the developer is using a standard Humanoid/Mixamo character, they do **not** need to manually drag and drop 33 GameObjects. They can attach this script directly to their Character model. It uses Unity's built-in `Animator` to automatically find every bone and apply the data.

```csharp
using UnityEngine;
using SocketIOClient; 

[RequireComponent(typeof(Animator))]
public class ShadowSyncMixamoRig : MonoBehaviour
{
    private SocketIOUnity socket;
    public string mySessionId = "5521";
    
    private Animator animator;
    private Transform[] mappedBones = new Transform[33];

    void Start()
    {
        animator = GetComponent<Animator>();

        // Automatically find the Mixamo bones in the 3D model
        mappedBones[0] = animator.GetBoneTransform(HumanBodyBones.Head);
        mappedBones[11] = animator.GetBoneTransform(HumanBodyBones.LeftShoulder);
        mappedBones[12] = animator.GetBoneTransform(HumanBodyBones.RightShoulder);
        mappedBones[13] = animator.GetBoneTransform(HumanBodyBones.LeftLowerArm); // Elbow
        mappedBones[14] = animator.GetBoneTransform(HumanBodyBones.RightLowerArm);
        mappedBones[15] = animator.GetBoneTransform(HumanBodyBones.LeftHand);     // Wrist
        mappedBones[16] = animator.GetBoneTransform(HumanBodyBones.RightHand);
        mappedBones[23] = animator.GetBoneTransform(HumanBodyBones.LeftUpperLeg); // Hip
        mappedBones[24] = animator.GetBoneTransform(HumanBodyBones.RightUpperLeg);
        mappedBones[25] = animator.GetBoneTransform(HumanBodyBones.LeftLowerLeg); // Knee
        mappedBones[26] = animator.GetBoneTransform(HumanBodyBones.RightLowerLeg);
        mappedBones[27] = animator.GetBoneTransform(HumanBodyBones.LeftFoot);     // Ankle
        mappedBones[28] = animator.GetBoneTransform(HumanBodyBones.RightFoot);
        
        // Connect to ShadowSync
        var uri = new System.Uri("https://shadowsync.onrender.com");
        socket = new SocketIOUnity(uri);

        socket.On("trackingData", (response) => {
            string json = response.GetValue<string>();
            TrackingPayload data = JsonUtility.FromJson<TrackingPayload>(json);
            if (data.sessionId != mySessionId) return;

            // Apply positions to all mapped bones instantly (60 times a second)
            for (int i = 0; i < 33; i++) {
                if (mappedBones[i] != null && data.landMarkCurrent[i].visibility > 0.3f) {
                    Landmark lm = data.landMarkCurrent[i];
                    // Convert to Unity coordinate system
                    mappedBones[i].position = new Vector3(lm.x, -lm.y, lm.z);
                }
            }
        });

        socket.Connect();
    }
}
```

---

## D. Godot (GDScript)

Using a Godot Socket.io addon, connect directly to the server.

### 1. Folder Structure
You can store your Godot project anywhere on your computer. 
```text
Anywhere_On_Your_PC/
  My_Godot_Project/
    Scripts/
      ShadowSyncReceiver.gd   <-- The script that connects to the server
```

### 2. Implementation Code
```gdscript
extends Node

var socket = SocketIOClient.new()
var my_session_id = "5521"

func _ready():
    # Set this to the URL where your Hub is running
    socket.connect_to_url("https://shadowsync.onrender.com")
    socket.on("trackingData", Callable(self, "_on_tracking_data"))
    add_child(socket)

func _on_tracking_data(data):
    if data["sessionId"] != my_session_id:
        return
        
    # Extract the specific body parts
    var left_wrist = data["landMarkCurrent"][15]
    
    # Update 3D Node positions
    # $Player/LeftHand.position = Vector3(left_wrist.x, left_wrist.y, left_wrist.z)
```
