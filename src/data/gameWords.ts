export const GAME_WORDS = [
  // Easy Animals
  'Cat', 'Dog', 'Fish', 'Bird', 'Mouse', 'Bear', 'Lion', 'Tiger', 'Elephant', 'Rabbit',
  'Horse', 'Cow', 'Pig', 'Sheep', 'Duck', 'Chicken', 'Frog', 'Butterfly', 'Bee', 'Spider',
  
  // Easy Objects
  'House', 'Car', 'Bike', 'Book', 'Phone', 'Clock', 'Chair', 'Table', 'Bed', 'Door',
  'Window', 'Key', 'Ball', 'Hat', 'Shoe', 'Cup', 'Plate', 'Spoon', 'Knife', 'Fork',
  
  // Easy Food
  'Apple', 'Banana', 'Orange', 'Grape', 'Pizza', 'Cake', 'Bread', 'Cheese', 'Egg', 'Fish',
  'Chicken', 'Ice Cream', 'Cookie', 'Candy', 'Chocolate', 'Hamburger', 'Hot Dog', 'Sandwich', 'Donut', 'Pie',
  
  // Nature
  'Tree', 'Flower', 'Sun', 'Moon', 'Star', 'Cloud', 'Rain', 'Snow', 'Mountain', 'River',
  'Beach', 'Ocean', 'Fire', 'Rainbow', 'Lightning', 'Wind', 'Earth', 'Rock', 'Grass', 'Leaf',
  
  // Body Parts
  'Eye', 'Nose', 'Mouth', 'Ear', 'Hand', 'Foot', 'Head', 'Hair', 'Tooth', 'Face',
  
  // Transportation
  'Plane', 'Train', 'Bus', 'Truck', 'Boat', 'Ship', 'Bicycle', 'Motorcycle', 'Helicopter', 'Rocket',
  
  // Sports & Activities
  'Soccer', 'Basketball', 'Tennis', 'Swimming', 'Running', 'Dancing', 'Singing', 'Reading', 'Writing', 'Drawing',
  
  // Emotions & Actions
  'Happy', 'Sad', 'Angry', 'Surprised', 'Sleeping', 'Jumping', 'Walking', 'Flying', 'Swimming', 'Eating',
  
  // Shapes & Colors
  'Circle', 'Square', 'Triangle', 'Heart', 'Diamond', 'Red', 'Blue', 'Green', 'Yellow', 'Purple',
  
  // Medium Difficulty
  'Guitar', 'Piano', 'Dinosaur', 'Castle', 'Princess', 'Knight', 'Dragon', 'Treasure', 'Pirate', 'Robot',
  'Computer', 'Television', 'Camera', 'Telephone', 'Airplane', 'Submarine', 'Telescope', 'Microscope', 'Calculator', 'Refrigerator'
]

export function getRandomWord(): string {
  return GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)]
}

export function getRandomWords(count: number): string[] {
  const shuffled = [...GAME_WORDS].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}